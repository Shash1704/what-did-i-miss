import type { MLCEngineInterface, InitProgressReport } from '@mlc-ai/web-llm'
import type { Analysis } from '../core/analyze'

export const MODELS = [
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen 2.5 · 1.5B (smart, ~1 GB)' },
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 · 1B (light, ~0.7 GB)' },
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 · 3B (best, ~2 GB)' },
]
export const DEFAULT_MODEL = MODELS[0].id
export const LIGHT_MODEL = MODELS[1].id

interface GpuInfo { ok: boolean; f16: boolean; maxBufferMB: number; deviceMemoryGB?: number }
let gpuInfoPromise: Promise<GpuInfo> | null = null

/** What this device's GPU can do (cached). */
export function gpuInfo(): Promise<GpuInfo> {
  gpuInfoPromise ??= (async () => {
    const deviceMemoryGB = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
    try {
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string>; limits: { maxBufferSize: number } } | null> } }).gpu
      const adapter = await gpu?.requestAdapter()
      if (!adapter) return { ok: false, f16: false, maxBufferMB: 0, deviceMemoryGB }
      return { ok: true, f16: adapter.features.has('shader-f16'), maxBufferMB: adapter.limits.maxBufferSize / 2 ** 20, deviceMemoryGB }
    } catch {
      return { ok: false, f16: false, maxBufferMB: 0, deviceMemoryGB }
    }
  })()
  return gpuInfoPromise
}

/** GPUs without 16-bit float shaders need the 32-bit-float build of the same model. */
export async function resolveModelId(id: string): Promise<string> {
  return (await gpuInfo()).f16 ? id : id.replace('q4f16_1', 'q4f32_1')
}

/** Pick a model that will actually run here: the light one on low-memory devices. */
export async function recommendModel(): Promise<{ id: string; reason: string }> {
  const g = await gpuInfo()
  if (!g.ok) return { id: DEFAULT_MODEL, reason: 'No WebGPU adapter found' }
  const lowMemory = (g.deviceMemoryGB !== undefined && g.deviceMemoryGB <= 4) || g.maxBufferMB < 1024
  const precision = g.f16 ? '' : ' (32-bit build for this GPU)'
  return lowMemory
    ? { id: LIGHT_MODEL, reason: `Lighter model picked for this device${precision}` }
    : { id: DEFAULT_MODEL, reason: `Best fit for this device${precision}` }
}

let engine: MLCEngineInterface | null = null
let loadedId: string | null = null

export function hasWebGPU(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

let worker: Worker | null = null

export async function loadModel(requested: string, onProgress: (r: InitProgressReport) => void) {
  const id = await resolveModelId(requested)
  if (engine && loadedId === id) return engine
  const webllm = await import('@mlc-ai/web-llm')
  if (engine) {
    engine.setInitProgressCallback(onProgress)
    await engine.reload(id)
  } else {
    try {
      // Preferred: a Web Worker keeps model loading and token generation off the UI thread
      worker ??= new Worker(new URL('../workers/llm.worker.ts', import.meta.url), { type: 'module' })
      engine = await webllm.CreateWebWorkerMLCEngine(worker, id, { initProgressCallback: onProgress })
    } catch (err) {
      console.warn('LLM worker unavailable, running on the main thread', err)
      worker?.terminate()
      worker = null
      engine = await webllm.CreateMLCEngine(id, { initProgressCallback: onProgress })
    }
  }
  loadedId = id
  return engine
}

export async function isCached(id: string): Promise<boolean> {
  try {
    const webllm = await import('@mlc-ai/web-llm')
    return await webllm.hasModelInCache(await resolveModelId(id))
  } catch {
    return false
  }
}

export function isLoaded() {
  return engine !== null
}



const dueText = (d: Date) => d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
const stripQuotes = (t: string) => t.replace(/^["'“]|["'”]$/g, '').trim()
const replyRequest = (who: string, text: string, due?: string) =>
  `${who} asked me in our group chat: "${text.replace(/\n/g, ' ').slice(0, 300)}"\nWrite my reply to ${who}, confirming I'll do it${due ? ` (deadline: ${due})` : ''}.`

function buildPrompt(a: Analysis, me: string): string {
  // Small on-device models do best with a narrow task over pre-extracted, grounded facts.
  // Each fact carries its sender and an absolute deadline, so the model neither swaps names
  // nor repeats stale relative words ("tomorrow"). Busy chats get only the flagged facts (extra
  // context confuses a 1.5B model); quiet chats get the actual recent messages, so the model
  // summarises what was said instead of inventing tasks.
  const now = a.now.toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' })
  const important = a.scored.filter(s => s.score >= 3).toSorted((x, y) => y.score - x.score).slice(0, 5)
  const facts = important.map((s, i) => {
    const forMe = s.owner === me ? ' [asks YOU]' : s.owner ? ` [for ${s.owner}]` : ''
    const dl = s.deadline ? ` [deadline: ${dueText(s.deadline)}]` : ''
    return `${i + 1}. ${s.msg.author} wrote${forMe}${dl}: ${s.msg.text.replace(/\n/g, ' ').slice(0, 200)}`
  }).join('\n')
  const shown = new Set(important.map(s => s.msg.id))
  const recent = a.scored.filter(s => !shown.has(s.msg.id)).slice(-12)
    .map(s => `- ${s.msg.author}: ${s.msg.text.replace(/\n/g, ' ').slice(0, 160)}`).join('\n')
  const rules = `Rules: talk to me as "you" and start with the word "You". Only use facts from the messages above; never invent deadlines, times, tasks or names. When you say who asked, use the name at the start of that same line. No greetings, bullet points, quotes, brackets or headings.`

  if (!important.length) {
    return `It is now ${now}. I am ${me}. I missed ${a.unread.length} message${a.unread.length === 1 ? '' : 's'} in my group chat:

${recent || '(no messages)'}

None of these need me. In 1 or 2 plain sentences (under 40 words), tell me what was said and that nothing needs my action.
${rules}`
  }

  return `It is now ${now}. I am ${me}. I missed ${a.unread.length} messages in my group chat. The important ones, most urgent first:

${facts}
${important.length < 3 && recent ? `\nThe other messages, for context only:\n${recent}\n` : ''}
Write a TL;DR for me in 2 or 3 plain sentences (under 70 words). Start with the most urgent thing I must do and its deadline, then the key decisions.
${rules} State deadlines using the [deadline: …] times, not words like "tomorrow" from the messages.`
}

export async function summarize(a: Analysis, me: string, onToken: (full: string) => void, signal?: { cancelled: boolean }) {
  if (!engine) throw new Error('Model not loaded')
  const stream = await engine.chat.completions.create({
    stream: true,
    temperature: 0, // deterministic: the most likely wording, no creative drift
    frequency_penalty: 0.6,
    presence_penalty: 0.3,
    max_tokens: 160,
    messages: [
      { role: 'system', content: 'You write brief, accurate catch-up summaries of group chats in plain prose. You never invent names, dates or tasks.' },
      { role: 'user', content: buildPrompt(a, me) },
    ],
  })
  let full = ''
  for await (const chunk of stream) {
    if (signal?.cancelled) { await engine.interruptGenerate(); break }
    full += chunk.choices[0]?.delta?.content ?? ''
    // Guard against small-model loops: stop once a bullet repeats
    const bullets = full.split('\n').map(l => l.trim()).filter(l => l.startsWith('-') && l.length > 20)
    if (bullets.length !== new Set(bullets).size) {
      await engine.interruptGenerate()
      full = [...new Set(full.split('\n'))].join('\n')
      onToken(full)
      break
    }
    onToken(full)
  }
  return full
}

/** Draft a short reply to a message addressed to you, written on-device. */
export async function draftReply(input: { author: string; text: string; me: string; due?: string }, onToken: (t: string) => void): Promise<string> {
  if (!engine) throw new Error('Model not loaded')
  const first = input.author.split(/\s+/)[0]
  // The model speaks AS the user (first person) and never needs the user's own name, which small
  // models otherwise confuse with the recipient. One example pins the style.
  const stream = await engine.chat.completions.create({
    stream: true,
    temperature: 0.3,
    max_tokens: 60,
    messages: [
      { role: 'system', content: 'You write short, friendly chat replies. You ARE the person replying: write in first person ("I"). One or two short sentences, under 25 words. Output only the reply text.' },
      { role: 'user', content: replyRequest('Priya', 'can you bring the banner to the hall by 10am tomorrow?', 'Sat 10:00 AM') },
      { role: 'assistant', content: "Sure Priya, I'll bring the banner to the hall before 10 tomorrow!" },
      { role: 'user', content: replyRequest(first, input.text, input.due) },
    ],
  })
  let full = ''
  for await (const chunk of stream) {
    full += chunk.choices[0]?.delta?.content ?? ''
    onToken(stripQuotes(full))
  }
  return stripQuotes(full)
}

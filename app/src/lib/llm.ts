import type { MLCEngineInterface, InitProgressReport } from '@mlc-ai/web-llm'
import { fmtWhen, type Analysis } from './analyze'

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
      worker ??= new Worker(new URL('./llm.worker.ts', import.meta.url), { type: 'module' })
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



function buildPrompt(a: Analysis, me: string): string {
  // Small on-device models do best with a narrow task over pre-extracted, grounded facts.
  // Each fact carries its sender and an absolute deadline, so the model neither swaps names
  // nor repeats stale relative words ("tomorrow") from old messages.
  const important = a.scored.filter(s => s.score >= 3).sort((x, y) => y.score - x.score).slice(0, 8)
  const now = a.now.toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' })
  const facts = important.map((s, i) => {
    const forMe = s.owner === me ? ' [asks YOU]' : s.owner ? ` [for ${s.owner}]` : ''
    const due = s.deadline ? ` [deadline: ${fmtWhen(s.deadline, a.now)}]` : ''
    return `${i + 1}. ${s.msg.author} wrote${forMe}${due}: ${s.msg.text.replace(/\n/g, ' ').slice(0, 200)}`
  }).join('\n')

  return `It is now ${now}. I am ${me}. I missed ${a.unread.length} messages in my group chat. The important ones, most urgent first:

${facts || '- nothing important'}

Write a TL;DR for me in 2 or 3 plain sentences (under 70 words). Start with the most urgent thing I must do and its deadline, then the key decisions.
Rules: talk to me as "you" and start with the word "You". When you say who asked, use the name at the start of that same numbered line. State deadlines using the [deadline: …] times, not words like "tomorrow" from the messages. No greetings, bullet points, quotes, brackets or headings.`
}

export async function summarize(a: Analysis, me: string, onToken: (full: string) => void, signal?: { cancelled: boolean }) {
  if (!engine) throw new Error('Model not loaded')
  const stream = await engine.chat.completions.create({
    stream: true,
    temperature: 0.1,
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

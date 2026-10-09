import type { MLCEngineInterface, InitProgressReport } from '@mlc-ai/web-llm'
import { fmtWhen, type Analysis } from './analyze'

export const MODELS = [
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen 2.5 · 1.5B (smart, ~1 GB)' },
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 · 1B (balanced, ~0.9 GB)' },
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 · 3B (best, ~2 GB)' },
]

let engine: MLCEngineInterface | null = null
let loadedId: string | null = null

export function hasWebGPU(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

export async function loadModel(id: string, onProgress: (r: InitProgressReport) => void) {
  if (engine && loadedId === id) return engine
  const webllm = await import('@mlc-ai/web-llm')
  if (engine) await engine.unload()
  engine = await webllm.CreateMLCEngine(id, { initProgressCallback: onProgress })
  loadedId = id
  return engine
}

export async function isCached(id: string): Promise<boolean> {
  try {
    const webllm = await import('@mlc-ai/web-llm')
    return await webllm.hasModelInCache(id)
  } catch {
    return false
  }
}

export function isLoaded() {
  return engine !== null
}



function buildPrompt(a: Analysis, me: string): string {
  // Small on-device models do best with a narrow task over pre-extracted, grounded facts.
  const important = a.scored.filter(s => s.score >= 3).sort((x, y) => y.score - x.score).slice(0, 14)
  const facts = important.map((s, i) => {
    const due = s.deadline ? ` [due ${fmtWhen(s.deadline, a.now).split(' · ')[0]}]` : ''
    const tags = s.flags.map(f => f.label).filter(l => !l.startsWith('due')).join(', ')
    return `${i + 1}. ${s.msg.author} wrote: "${s.msg.text.replace(/\n/g, ' ').slice(0, 220)}"${due}${tags ? ` (${tags})` : ''}`
  }).join('\n')
  const chatter = a.unread.length - important.length

  return `My name is ${me}. While I was away, ${a.unread.length} messages were posted in my group chat. Here are the important ones (the other ${chatter} were casual chatter):

${facts || 'None.'}

Tell me what I missed in 4 to 6 short bullet points, most urgent first. Address me as "you". For each point say who, what, and the deadline if there is one. Start every line with "- ". Only use facts from the messages above.`
}

export async function summarize(a: Analysis, me: string, onToken: (full: string) => void, signal?: { cancelled: boolean }) {
  if (!engine) throw new Error('Model not loaded')
  const stream = await engine.chat.completions.create({
    stream: true,
    temperature: 0.1,
    frequency_penalty: 0.6,
    presence_penalty: 0.3,
    max_tokens: 350,
    messages: [
      { role: 'system', content: 'You write brief, accurate catch-up summaries of group chats. You never invent names, dates or tasks.' },
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

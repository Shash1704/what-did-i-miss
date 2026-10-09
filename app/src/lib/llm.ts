import type { MLCEngineInterface, InitProgressReport } from '@mlc-ai/web-llm'
import type { Analysis } from './analyze'

export const MODELS = [
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen 2.5 · 1.5B (smart, ~1 GB)' },
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 · 1B (balanced, ~0.9 GB)' },
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', label: 'Qwen 2.5 · 0.5B (fast, ~0.4 GB)' },
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

const MAX_CHARS = 7000

function buildPrompt(a: Analysis, me: string): string {
  const lines = a.unread.map(m => {
    const t = m.ts.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    return `[${t}] ${m.author}: ${m.text.replace(/\n/g, ' ')}`
  })
  // Keep the most important messages if the chat is too long for the small model's context
  let transcript = lines.join('\n')
  if (transcript.length > MAX_CHARS) {
    const keep = new Set(a.scored.filter(s => s.score >= 3).map(s => s.msg.id))
    transcript = a.unread.filter(m => keep.has(m.id)).map((_, i) => lines[i]).join('\n').slice(-MAX_CHARS)
  }
  const hints = a.scored.filter(s => s.score >= 3).slice(0, 15)
    .map(s => `- (${s.flags.map(f => f.label).join(', ')}) ${s.msg.author}: ${s.msg.text.slice(0, 140)}`).join('\n')

  return `I am ${me}. I was away and missed these group chat messages:

${transcript}

Messages flagged as important:
${hints || '- none'}

Write my catch-up briefing. Use exactly this format, short bullets, no preamble:

**TL;DR**
- (2-3 bullets: the most important things that happened)

**Decisions made**
- (each decision, one line)

**What I (${me}) need to do**
- (each task assigned to me, with its deadline)

**Others' tasks**
- (person: task)`
}

export async function summarize(a: Analysis, me: string, onToken: (full: string) => void, signal?: { cancelled: boolean }) {
  if (!engine) throw new Error('Model not loaded')
  const stream = await engine.chat.completions.create({
    stream: true,
    temperature: 0.2,
    max_tokens: 450,
    messages: [
      { role: 'system', content: 'You are a concise assistant that summarizes group chats. Only state facts present in the messages. Never invent names, dates or tasks.' },
      { role: 'user', content: buildPrompt(a, me) },
    ],
  })
  let full = ''
  for await (const chunk of stream) {
    if (signal?.cancelled) { await engine.interruptGenerate(); break }
    full += chunk.choices[0]?.delta?.content ?? ''
    onToken(full)
  }
  return full
}

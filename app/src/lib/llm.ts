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
  const important = a.scored.filter(s => s.score >= 3).sort((x, y) => y.score - x.score).slice(0, 8)
  const facts = important.map(s => {
    const due = s.deadline ? ` (deadline: ${fmtWhen(s.deadline, a.now).split(' · ')[0]})` : ''
    return `- ${s.msg.author}: ${s.msg.text.replace(/\n/g, ' ').slice(0, 200)}${due}`
  }).join('\n')

  return `I am ${me}. I was away and missed ${a.unread.length} messages in my group chat. The important ones, most urgent first:

${facts || '- nothing important'}

Write a TL;DR for me in 2 or 3 plain sentences (under 70 words). Start with the most urgent thing I personally must do and its deadline, then mention the key decisions. Talk to me as "you" and start your answer with the word "You". No greetings, no bullet points, no quotes, no headings.`
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

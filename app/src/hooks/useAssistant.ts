import { useEffect, useRef, useState } from 'react'
import type { Analysis, Scored } from '../core/analyze'
import { fmtDayTime } from '../core/format'
import { LIGHT_MODEL, MODELS, draftReply, hasWebGPU, isCached, loadModel, recommendModel, summarize } from '../services/llm'

export type AssistantStatus = 'idle' | 'loading' | 'ready' | 'generating' | 'done' | 'error' | 'unsupported'
export interface Draft { status: 'loading' | 'writing' | 'done' | 'error'; text: string; copied?: boolean }
type Progress = { progress: number; text: string }

/**
 * The on-device AI: model choice, the catch-up summary and reply drafts.
 * A summary belongs to the analysis it was written for, so a new chat, identity or read point
 * simply makes it stale (derived, no reset effects). Drafts likewise belong to one chat.
 */
export function useAssistant(analysis: Analysis | null, myName: string, chatKey: string) {
  const [phase, setPhase] = useState<AssistantStatus>(() => (hasWebGPU() ? 'idle' : 'unsupported'))
  const [modelId, setModelId] = useState(MODELS[0].id)
  const [modelNote, setModelNote] = useState('')
  const [progress, setProgress] = useState({ pct: 0, text: '' })
  const [result, setResult] = useState<{ for: Analysis | null; text: string; ms: number }>({ for: null, text: '', ms: 0 })
  const [cached, setCached] = useState(false)
  const [draftState, setDraftState] = useState<{ key: string; map: Record<number, Draft> }>({ key: chatKey, map: {} })
  const cancel = useRef({ cancelled: false })
  const modelTouched = useRef(false)

  // Pick a model this device can actually run, unless the user already chose one
  useEffect(() => {
    recommendModel().then(r => { if (!modelTouched.current) { setModelId(r.id); setModelNote(r.reason) } }).catch(() => {})
  }, [])
  useEffect(() => { isCached(modelId).then(setCached).catch(() => setCached(false)) }, [modelId])

  const fresh = result.for === analysis
  const summary = fresh ? result.text : ''
  const status: AssistantStatus = !fresh && phase === 'done' ? 'ready' : phase
  const drafts = draftState.key === chatKey ? draftState.map : {}

  const onProgress = (r: Progress) => setProgress({ pct: Math.round(r.progress * 100), text: r.text })

  async function ensureModel(report: (r: Progress) => void = onProgress) {
    try {
      await loadModel(modelId, report)
    } catch (err) {
      // Out of GPU memory or an unsupported GPU feature: retry once with the lightest model
      if (modelId === LIGHT_MODEL) throw err
      console.warn('Model failed to load, falling back to the light model', err)
      setModelId(LIGHT_MODEL)
      setModelNote('Switched to a lighter model for this device')
      await loadModel(LIGHT_MODEL, report)
    }
    setCached(true)
  }

  async function runSummary() {
    if (!analysis) return
    const target = analysis
    cancel.current = { cancelled: false }
    try {
      setPhase('loading')
      await ensureModel()
      setPhase('generating')
      setResult({ for: target, text: '', ms: 0 })
      const t0 = performance.now()
      await summarize(target, myName, text => setResult({ for: target, text, ms: 0 }), cancel.current)
      setResult(r => ({ ...r, ms: performance.now() - t0 }))
      setPhase('done')
    } catch (err) {
      console.error(err)
      setProgress({ pct: 0, text: (err as Error).message || String(err) })
      setPhase('error')
    }
  }

  const stop = () => { cancel.current.cancelled = true }

  function chooseModel(id: string) {
    modelTouched.current = true
    setModelId(id)
    setModelNote('')
  }

  const setDraft = (id: number, d: Draft) =>
    setDraftState(prev => ({ key: chatKey, map: { ...(prev.key === chatKey ? prev.map : {}), [id]: d } }))

  async function makeDraft(s: Scored) {
    const id = s.msg.id
    setDraft(id, { status: 'loading', text: 'Loading the on-device model…' })
    try {
      await ensureModel(r => setDraft(id, { status: 'loading', text: `Loading the on-device model… ${Math.round(r.progress * 100)}%` }))
      setPhase(prev => (prev === 'idle' ? 'ready' : prev))
      setDraft(id, { status: 'writing', text: '' })
      const due = s.deadline ? fmtDayTime(s.deadline) : undefined
      const text = await draftReply({ author: s.msg.author, text: s.msg.text, me: myName, due }, t => setDraft(id, { status: 'writing', text: t }))
      setDraft(id, { status: 'done', text })
    } catch (err) {
      setDraft(id, { status: 'error', text: (err as Error).message })
    }
  }

  async function copyDraft(id: number) {
    const draft = drafts[id]
    if (!draft) return
    try {
      await navigator.clipboard.writeText(draft.text)
      setDraft(id, { ...draft, copied: true })
      setTimeout(() => setDraft(id, { ...draft, copied: false }), 1800)
    } catch { /* clipboard permission denied: the text is still visible to copy by hand */ }
  }

  const modelName = MODELS.find(m => m.id === modelId)?.label.split(' (')[0] ?? modelId

  return { status, modelId, modelName, modelNote, progress, summary, cached, genMs: result.ms, drafts, runSummary, stop, chooseModel, makeDraft, copyDraft }
}

export type Assistant = ReturnType<typeof useAssistant>

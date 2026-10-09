import { useCallback, useMemo, useState } from 'react'
import { analyze } from '../core/analyze'
import { buildBriefing } from '../core/briefing'
import { displayName, isMe, nameSuggestions } from '../core/identity'
import { parseChat, participants, type Message } from '../core/parser'
import { buildDemoChat, DEMO_LAST_READ, DEMO_ME, DEMO_NAME } from '../data/demo'
import type { ChatSource } from '../services/importFile'
import { storage } from '../services/storage'

export type SessionSource = ChatSource | 'demo'
export type SincePreset = 'visit' | 'mine' | '1h' | 'today' | '24h' | 'all' | 'custom'
export interface OpenableChat { name: string; messages: Message[]; source: SessionSource; me?: string }
export interface OpenResult { askIdentity: boolean; prefill: string }

const HOUR = 3_600_000

/** You've read everything up to your own last message; if you never spoke, treat the first 20% as read. */
export function defaultSince(list: Message[], identity: string): number {
  for (let i = list.length - 1; i >= 0; i--) if (isMe(list[i].author, identity)) return Math.min(i + 1, list.length - 1)
  return Math.floor(list.length * 0.2)
}

/**
 * The open chat and everything derived from it: who you are, what counts as unread,
 * the analysis and the briefing view-model. Opens on the demo chat so the app is useful immediately.
 */
export function useChatSession() {
  const [msgs, setMsgs] = useState<Message[]>(() => parseChat(buildDemoChat()))
  const [source, setSource] = useState<SessionSource>('demo')
  const [chatName, setChatName] = useState(DEMO_NAME)
  const [identity, setIdentity] = useState(DEMO_ME)
  const [sinceIdx, setSinceIdx] = useState(DEMO_LAST_READ)
  const [sincePreset, setSincePreset] = useState<SincePreset>('custom') // the demo opens at a fixed read point
  const [visitIdx, setVisitIdx] = useState(-1)
  const [ticked, setTicked] = useState<ReadonlySet<number>>(() => new Set())

  const isDemo = source === 'demo'
  const people = useMemo(() => participants(msgs), [msgs])
  const analysis = useMemo(() => (msgs.length ? analyze(msgs, identity, sinceIdx, people) : null), [msgs, identity, sinceIdx, people])
  const myName = displayName(identity)
  const briefing = useMemo(() => (analysis ? buildBriefing(analysis, identity, myName, ticked) : null), [analysis, identity, myName, ticked])
  const suggestions = useMemo(() => nameSuggestions(people, msgs.map(m => m.text)), [people, msgs])
  const lastRead = msgs[Math.max(0, sinceIdx - 1)]

  /** Load a chat. Starts "since my last visit" if seen before, else after your own last message. */
  const open = useCallback((chat: OpenableChat, opts: { identity?: string; lastRead?: number } = {}): OpenResult => {
    const list = chat.messages
    if (!list.length) throw new Error('Couldn\'t find any messages. Use a WhatsApp or Telegram export, or paste lines like "Name: message".')
    const demo = chat.source === 'demo'
    const remembered = storage.identity.get()
    const who = opts.identity ?? remembered ?? chat.me ?? ''
    setMsgs(list)
    setSource(chat.source)
    setChatName(chat.name)
    setIdentity(who)
    setTicked(new Set())

    const lastSeen = demo ? 0 : storage.lastSeen.get(chat.source, chat.name)
    const firstNew = lastSeen ? list.findIndex(m => m.ts.getTime() > lastSeen) : -1
    if (opts.lastRead !== undefined) { setSinceIdx(opts.lastRead); setSincePreset('custom'); setVisitIdx(-1) }
    else if (firstNew > 0) { setSinceIdx(firstNew); setSincePreset('visit'); setVisitIdx(firstNew) }
    else { setSinceIdx(defaultSince(list, who)); setSincePreset('mine'); setVisitIdx(-1) }
    if (!demo) storage.lastSeen.set(chat.source, chat.name, list[list.length - 1].ts.getTime())

    return { askIdentity: !demo && !remembered, prefill: chat.me ?? '' }
  }, [])

  const loadDemo = useCallback(
    () => open({ name: DEMO_NAME, messages: parseChat(buildDemoChat()), source: 'demo' }, { identity: DEMO_ME, lastRead: DEMO_LAST_READ }),
    [open],
  )

  function applySince(preset: SincePreset) {
    setSincePreset(preset)
    if (preset === 'custom' || !msgs.length) return
    if (preset === 'visit') { setSinceIdx(Math.max(0, visitIdx)); return }
    if (preset === 'mine') { setSinceIdx(defaultSince(msgs, identity)); return }
    const end = msgs[msgs.length - 1].ts.getTime()
    const from = preset === 'all' ? -Infinity : preset === '1h' ? end - HOUR : preset === '24h' ? end - 24 * HOUR : new Date(end).setHours(0, 0, 0, 0)
    setSinceIdx(Math.max(0, msgs.findIndex(m => m.ts.getTime() >= from)))
  }

  function setSinceManually(idx: number) {
    setSinceIdx(idx)
    setSincePreset('custom')
  }

  function saveIdentity(raw: string) {
    const value = raw.split(',').map(x => x.trim()).filter(Boolean).join(', ')
    if (!value) return
    setIdentity(value)
    if (!isDemo) {
      setSinceIdx(defaultSince(msgs, value))
      storage.identity.set(value)
    }
  }

  const toggleTicked = (id: number) => setTicked(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  return {
    msgs, source, chatName, identity, myName, isDemo, people, suggestions,
    sinceIdx, sincePreset, visitIdx, lastRead, ticked, analysis, briefing,
    open, loadDemo, applySince, setSinceManually, saveIdentity, toggleTicked,
    /** Live sources (Telegram bot) append messages to the open chat. */
    replaceMessages: setMsgs,
  }
}

export type ChatSession = ReturnType<typeof useChatSession>

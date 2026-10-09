import { useEffect, useRef, useState } from 'react'
import type { Message } from '../core/parser'
import { chatMessages, connectBot, listChats, loadStore, pollOnce, saveStore, type LiveChatInfo, type TgStore } from '../services/telegramBot'

export type TelegramStatus = 'off' | 'connecting' | 'live' | 'error'
const RETRY_MS = 5000
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Live Telegram through the user's own bot: the browser long-polls api.telegram.org directly.
 * `onMessages` fires when the chat currently followed (see `openChat`) receives new messages.
 */
export function useTelegramLive(onMessages: (messages: Message[]) => void) {
  const [store, setStore] = useState<TgStore | null>(() => loadStore())
  const [status, setStatus] = useState<TelegramStatus>(() => (store ? 'connecting' : 'off'))
  const [error, setError] = useState('')
  const [chats, setChats] = useState<LiveChatInfo[]>(() => (store ? listChats(store) : []))
  const followRef = useRef<string | null>(null)
  const onMessagesRef = useRef(onMessages)
  useEffect(() => { onMessagesRef.current = onMessages })

  useEffect(() => {
    if (!store) return
    const ctrl = new AbortController()
    void (async () => {
      while (!ctrl.signal.aborted) {
        try {
          // Long polling is inherently sequential: each request waits up to ~25s for new messages
          // oxlint-disable-next-line no-await-in-loop
          const changed = await pollOnce(store, ctrl.signal)
          saveStore(store)
          setStatus('live')
          setError('')
          if (changed.length) setChats(listChats(store))
          const followed = followRef.current
          if (followed && changed.includes(followed)) onMessagesRef.current(chatMessages(store, followed))
        } catch (err) {
          if (ctrl.signal.aborted) break
          setStatus('error')
          setError((err as Error).message)
          // oxlint-disable-next-line no-await-in-loop
          await sleep(RETRY_MS)
        }
      }
    })()
    return () => ctrl.abort()
  }, [store])

  async function connect(pasted: string) {
    if (!pasted.trim()) return
    setStatus('connecting')
    setError('')
    try {
      const next = await connectBot(pasted)
      saveStore(next)
      setChats(listChats(next))
      setStore(next)
    } catch (err) {
      setStatus('error')
      setError((err as Error).message)
    }
  }

  /** Forget the bot token and every received message. */
  function disconnect() {
    saveStore(null)
    followRef.current = null
    setStore(null)
    setChats([])
    setStatus('off')
    setError('')
  }

  /** Messages of a live chat, and start following it for updates. */
  function openChat(id: string): { name: string; messages: Message[] } | null {
    if (!store) return null
    followRef.current = id
    return { name: store.chats[id]?.title ?? 'Telegram chat', messages: chatMessages(store, id) }
  }

  const unfollow = () => { followRef.current = null }

  return { connected: !!store, status, error, chats, botName: store?.bot ?? '', connect, disconnect, openChat, unfollow }
}

export type TelegramLive = ReturnType<typeof useTelegramLive>

import { useEffect, useState } from 'react'

/** Tracks navigator.onLine, so the UI can show it still works offline. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

interface InstallPromptEvent extends Event { prompt: () => Promise<void> }

/** The browser's "install this app" prompt, if available. Returns a function to show it, or null. */
export function useInstallPrompt(): (() => Promise<void>) | null {
  const [evt, setEvt] = useState<InstallPromptEvent | null>(null)
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as InstallPromptEvent) }
    const onInstalled = () => setEvt(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])
  return evt ? () => evt.prompt().finally(() => setEvt(null)) : null
}

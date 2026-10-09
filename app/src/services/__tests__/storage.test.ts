// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { storage } from '../storage'

describe('storage layer', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear() })

  it('round-trips identity, last-visit and session flags', () => {
    storage.identity.set('Shashwat, @shashwat_p')
    expect(storage.identity.get()).toBe('Shashwat, @shashwat_p')
    expect(storage.lastSeen.get('whatsapp', 'Fest')).toBe(0)
    storage.lastSeen.set('whatsapp', 'Fest', 1791500000000)
    expect(storage.lastSeen.get('whatsapp', 'Fest')).toBe(1791500000000)
    expect(storage.introSeen.get()).toBe(false)
    storage.introSeen.set()
    expect(storage.introSeen.get()).toBe(true)
  })

  it('stores JSON and fully deletes it on null', () => {
    storage.telegram.set({ token: 'x', chats: {} })
    expect(storage.telegram.get<{ token: string }>()?.token).toBe('x')
    storage.telegram.set(null)
    expect(storage.telegram.get()).toBeNull()
    expect(localStorage.length).toBe(0)
  })

  it('survives corrupted data instead of crashing', () => {
    localStorage.setItem('wdim-tg-live', '{not json')
    expect(storage.telegram.get()).toBeNull()
  })
})

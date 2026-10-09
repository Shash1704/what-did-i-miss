// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { parseChat } from '../../core/parser'
import { ENGINE_API_VERSION, EngineError, analyzeChat, importChat, validateAnalyzeRequest } from '..'

const messages = parseChat([
  '09/10/2026, 09:00 - Shashwat: brb',
  '09/10/2026, 09:30 - Ananya: @Shashwat can you send the deck by 5pm today? Urgent!!',
  '09/10/2026, 09:40 - Rohan: Final: venue moved to Main Auditorium.',
].join('\n'))

describe('engine API', () => {
  it('analyses a valid request and returns a versioned, typed response', () => {
    const r = analyzeChat({ messages, identity: 'Shashwat', readFrom: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.apiVersion).toBe(ENGINE_API_VERSION)
    expect(r.value.briefing.openTasks).toBe(1)
    expect(r.value.analysis.decisions).toHaveLength(1)
    expect(r.value.tookMs).toBeGreaterThanOrEqual(0)
  })

  it('rejects invalid input with a typed error instead of throwing', () => {
    const r = analyzeChat({ messages, identity: 'Shashwat', readFrom: 99 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toBeInstanceOf(EngineError)
    expect(r.error.code).toBe('INVALID_INPUT')
    expect(validateAnalyzeRequest({ messages: [{ id: 0, author: '', text: 'x', ts: new Date('nope') }], identity: 'x', readFrom: 0 }))
      .toEqual(['messages[0].author must be a non-empty string', 'messages[0].ts must be a valid Date'])
  })

  it('reports an empty chat explicitly', () => {
    const r = analyzeChat({ messages: [], identity: '', readFrom: 0 })
    expect(!r.ok && r.error.code).toBe('EMPTY_CHAT')
  })

  it('maps import failures to stable error codes', async () => {
    const tooBig = { size: 60 * 1024 * 1024 } as Blob
    Object.setPrototypeOf(tooBig, Blob.prototype)
    expect(await importChat(tooBig, 'video.mp4')).toMatchObject({ ok: false, error: { code: 'FILE_TOO_LARGE' } })
    expect(await importChat(new File(['{"a":1}'], 'x.json'), 'x.json')).toMatchObject({ ok: false, error: { code: 'UNSUPPORTED_FORMAT' } })
    expect(await importChat(new File(['nothing here'], 'x.txt'), 'x.txt')).toMatchObject({ ok: false, error: { code: 'EMPTY_CHAT' } })
    const good = await importChat(new File(['09/10/2026, 09:00 - A: hi'], 'WhatsApp Chat with Fest.txt'), 'WhatsApp Chat with Fest.txt')
    expect(good).toMatchObject({ ok: true, value: { source: 'whatsapp', name: 'Fest' } })
  })
})

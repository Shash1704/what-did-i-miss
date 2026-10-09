// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { readChatFile, MAX_FILE_BYTES } from '../importFile'
import { extractToken } from '../telegramBot'
const base = 1791500000

const json = {
  name: 'Rangasthala Core',
  type: 'private_supergroup',
  messages: [
    { type: 'service', date_unixtime: String(base), actor: 'Nishitha', action: 'create_group', text: '' },
    { type: 'message', date_unixtime: String(base + 60), from: 'Nishitha', text: 'Hi team' },
    { type: 'message', date_unixtime: String(base + 120), from: 'Rahul K', text: [{ type: 'mention', text: '@shashwat_p' }, ' can you book the hall?'] },
    { type: 'message', date_unixtime: String(base + 180), from: 'Meghana', text: '', photo: 'photos/1.jpg' },
    { type: 'message', date_unixtime: String(base + 240), from: 'Meghana', text: '', sticker_emoji: '👍' },
    { type: 'message', date_unixtime: String(base + 300), from: null, text: 'ghost' },
  ],
}

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body><div class="page_wrap">
<div class="page_header"><div class="content"><div class="text bold">Fest Team</div></div></div>
<div class="page_body chat_page"><div class="history">
<div class="message service"><div class="body details">8 October 2026</div></div>
<div class="message default clearfix"><div class="body"><div class="pull_right date details" title="08.10.2026 21:03:40 UTC+05:30">21:03</div><div class="from_name">Rahul K </div><div class="text">@shashwat_p book the hall</div></div></div>
<div class="message default clearfix joined"><div class="body"><div class="pull_right date details" title="08.10.2026 21:04:10 UTC+05:30">21:04</div><div class="text">and send the poster</div></div></div>
</div></div></div></body></html>`

const asFile = (s: string, n: string) => new File([s], n)

describe('readChatFile source detection', () => {
  it('routes JSON, HTML and text to the right parser', async () => {
    expect((await readChatFile(asFile(JSON.stringify(json), 'result.json'), 'result.json')).source).toBe('telegram')
    expect((await readChatFile(asFile(html, 'messages.html'), 'messages.html')).source).toBe('telegram')
    const wa = await readChatFile(asFile('09/10/2026, 14:05 - A: hi', 'WhatsApp Chat with Fest.txt'), 'WhatsApp Chat with Fest.txt')
    expect([wa.source, wa.name]).toEqual(['whatsapp', 'Fest'])
  })
})

describe('Telegram bot token paste', () => {
  it('extracts the token from whatever was pasted', () => {
    const secret = 'AAHfakeFakeFakeFakeFakeFakeFakeFake' // real secrets are always 35 characters
    expect(secret).toHaveLength(35)
    const t = `1234567890:${secret}`
    expect(extractToken(t)).toBe(t)
    expect(extractToken(`bot${t}`)).toBe(t)
    expect(extractToken(`Use this token to access the HTTP API:\n${t}\nKeep your token secure`)).toBe(t)
    expect(extractToken(` "${t}"\u200b `)).toBe(t)
    expect(extractToken(`1234567890:${secret.slice(0, 17)} ${secret.slice(17)}`)).toBe(t)   // space added while copying
    expect(extractToken(`1234567890:${secret.slice(0, 20)}\n${secret.slice(20)}`)).toBe(t)  // line wrap
    expect(extractToken('@my_fest_bot')).toBeNull()
  })
})

describe('import safety', () => {
  it('rejects files that are far too large to be a chat export', async () => {
    const huge = { size: MAX_FILE_BYTES + 1, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Blob
    await expect(readChatFile(huge, 'video.mp4')).rejects.toThrow(/MB/)
  })
  it('rejects JSON that is not a Telegram export', async () => {
    await expect(readChatFile(new File(['{"hello":1}'], 'x.json'), 'x.json')).rejects.toThrow(/Unrecognised JSON/)
  })
})

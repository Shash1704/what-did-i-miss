// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { looksLikeTelegramHtml, looksLikeTelegramJson, parseTelegramHtml, parseTelegramJson } from '../telegramExport'

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

describe('Telegram JSON', () => {
  it('detects and parses messages, flattening rich text', () => {
    expect(looksLikeTelegramJson(json)).toBe(true)
    const chat = parseTelegramJson(json)
    expect(chat.name).toBe('Rangasthala Core')
    expect(chat.messages.map(m => [m.author, m.text])).toEqual([
      ['Nishitha', 'Hi team'],
      ['Rahul K', '@shashwat_p can you book the hall?'],
      ['Meghana', '👍'],
      ['Deleted Account', 'ghost'],
    ])
    expect(chat.messages[0].ts.getTime()).toBe((base + 60) * 1000)
  })

  it('picks the most recent chat from a full-account export and reads your name', () => {
    const full = {
      personal_information: { first_name: 'Shashwat', last_name: 'Prakash', username: 'shashwat_p' },
      chats: { list: [
        { name: 'Old', messages: [{ type: 'message', date_unixtime: '100', from: 'A', text: 'x' }] },
        { name: 'Recent', messages: [{ type: 'message', date_unixtime: '999', from: 'B', text: 'y' }] },
      ] },
    }
    const chat = parseTelegramJson(full)
    expect(chat.name).toBe('Recent')
    expect(chat.me).toBe('Shashwat Prakash, @shashwat_p')
  })
})

describe('Telegram HTML', () => {
  it('parses senders, joined messages and UTC offsets', () => {
    expect(looksLikeTelegramHtml(html)).toBe(true)
    const chat = parseTelegramHtml(html)
    expect(chat.name).toBe('Fest Team')
    expect(chat.messages.map(m => [m.author, m.text])).toEqual([
      ['Rahul K', '@shashwat_p book the hall'],
      ['Rahul K', 'and send the poster'],
    ])
    expect(chat.messages[0].ts.toISOString()).toBe('2026-10-08T15:33:40.000Z')
  })
})

// Reads a chat export and detects its source:
//   WhatsApp .txt / .zip (iOS puts "_chat.txt" inside a zip), Telegram Desktop result.json / messages.html.
// Zip extraction uses the browser's built-in DecompressionStream, so no dependency and no upload.

import { parseChat, type Message } from './parser'
import { looksLikeTelegramHtml, looksLikeTelegramJson, parseTelegramHtml, parseTelegramJson } from './telegram'

export type ChatSource = 'whatsapp' | 'telegram' | 'text'
export interface LoadedChat { name: string; messages: Message[]; source: ChatSource; me?: string }

const decoder = new TextDecoder('utf-8')

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function extractChatFromZip(buf: ArrayBuffer): Promise<string> {
  const view = new DataView(buf)
  const bytes = new Uint8Array(buf)

  // Locate the End Of Central Directory record (scan backwards past any comment)
  let eocd = -1
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Not a valid zip file')

  const count = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true)
  const entries: { name: string; method: number; size: number; offset: number }[] = []
  for (let i = 0; i < count && view.getUint32(p, true) === 0x02014b50; i++) {
    const method = view.getUint16(p + 10, true)
    const size = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const offset = view.getUint32(p + 42, true)
    entries.push({ name: decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen)), method, size, offset })
    p += 46 + nameLen + extraLen + commentLen
  }

  const entry = entries.find(e => /_chat\.txt$/i.test(e.name)) ?? entries.find(e => /\.txt$/i.test(e.name))
  if (!entry) throw new Error('No chat .txt found inside the zip')

  const lh = entry.offset
  const start = lh + 30 + view.getUint16(lh + 26, true) + view.getUint16(lh + 28, true)
  const data = bytes.subarray(start, start + entry.size)
  if (entry.method === 0) return decoder.decode(data)
  if (entry.method === 8) return decoder.decode(await inflateRaw(data))
  throw new Error(`Unsupported zip compression (method ${entry.method})`)
}

export function chatNameFromFile(filename: string): string {
  return filename
    .replace(/\.(txt|zip)$/i, '')
    .replace(/^WhatsApp Chat (with|-)\s*/i, '')
    .replace(/^_chat$/i, 'WhatsApp chat')
    .trim() || 'WhatsApp chat'
}

export async function readChatFile(file: Blob, filename: string): Promise<LoadedChat> {
  const buf = await file.arrayBuffer()
  const head = new Uint8Array(buf, 0, Math.min(4, buf.byteLength))
  const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04
  if (isZip) return { name: chatNameFromFile(filename), messages: parseChat(await extractChatFromZip(buf)), source: 'whatsapp' }

  const text = decoder.decode(buf).replace(/^\uFEFF/, '')
  const trimmed = text.trimStart()
  if (trimmed.startsWith('{')) {
    let data: unknown
    try { data = JSON.parse(text) } catch { throw new Error('That JSON file is not valid') }
    if (looksLikeTelegramJson(data)) return { ...parseTelegramJson(data), source: 'telegram' }
    throw new Error('Unrecognised JSON. For Telegram, export from Telegram Desktop as JSON (result.json)')
  }
  if (/^<!DOCTYPE html|^<html/i.test(trimmed)) {
    if (looksLikeTelegramHtml(text)) return { ...parseTelegramHtml(text), source: 'telegram' }
    throw new Error('Unrecognised HTML file. For Telegram, open messages.html from the export folder')
  }
  const messages = parseChat(text)
  const timestamped = /^\u200e?\[?\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/m.test(text)
  return { name: chatNameFromFile(filename), messages, source: timestamped ? 'whatsapp' : 'text' }
}

/** Picks up a chat shared into the installed app via WhatsApp's share sheet (see public/sw.js). */
export async function takeSharedChat(): Promise<LoadedChat | null> {
  if (!('caches' in window)) return null
  const cache = await caches.open('wdim-share')
  const res = await cache.match('shared')
  if (!res) return null
  await cache.delete('shared')
  const name = decodeURIComponent(res.headers.get('x-name') || 'Shared chat')
  return readChatFile(await res.blob(), name)
}

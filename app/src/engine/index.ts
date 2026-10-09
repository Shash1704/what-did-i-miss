/**
 * Engine API: the single, versioned entry point to the on-device "backend".
 *
 * The UI never reaches into parsers or the rule engine directly; it calls these functions,
 * which validate input, run the pure core, and return typed results or typed errors.
 * Everything runs locally: no request leaves the device.
 */
import { analyze, type Analysis } from '../core/analyze'
import { buildBriefing, type Briefing } from '../core/briefing'
import { displayName } from '../core/identity'
import { participants, type Message } from '../core/parser'
import { MAX_FILE_BYTES, readChatFile, type LoadedChat } from '../services/importFile'

export const ENGINE_API_VERSION = '1.0.0'

export type EngineErrorCode =
  | 'INVALID_INPUT'     // a request failed validation
  | 'EMPTY_CHAT'        // the input contained no messages
  | 'FILE_TOO_LARGE'    // above MAX_FILE_BYTES
  | 'UNSUPPORTED_FORMAT' // not WhatsApp, Telegram or "Name: message" text
  | 'INTERNAL'          // unexpected failure (bug)

/** A typed, user-presentable engine error. `code` is stable; `message` is human-readable. */
export class EngineError extends Error {
  readonly code: EngineErrorCode
  constructor(code: EngineErrorCode, message: string) {
    super(message)
    this.name = 'EngineError'
    this.code = code
  }
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: EngineError }

const ok = <T>(value: T): Result<T> => ({ ok: true, value })
const fail = <T>(code: EngineErrorCode, message: string): Result<T> => ({ ok: false, error: new EngineError(code, message) })

export interface AnalyzeRequest {
  messages: Message[]
  /** Free-text identity: names, @usernames, phone numbers, comma-separated. May be empty. */
  identity: string
  /** Index of the first unread message (0 = everything is unread). */
  readFrom: number
  /** Ids of tasks the user ticked off. */
  ticked?: ReadonlySet<number>
}

export interface AnalyzeResponse {
  apiVersion: string
  analysis: Analysis
  briefing: Briefing
  people: string[]
  /** Time spent in the engine, for performance monitoring. */
  tookMs: number
}

const isValidDate = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime())

/** Validate a request without throwing. Returns a list of problems (empty = valid). */
export function validateAnalyzeRequest(req: AnalyzeRequest): string[] {
  const problems: string[] = []
  if (!Array.isArray(req.messages)) return ['messages must be an array']
  req.messages.forEach((m, i) => {
    if (typeof m?.author !== 'string' || !m.author) problems.push(`messages[${i}].author must be a non-empty string`)
    if (typeof m?.text !== 'string') problems.push(`messages[${i}].text must be a string`)
    if (!isValidDate(m?.ts)) problems.push(`messages[${i}].ts must be a valid Date`)
  })
  if (typeof req.identity !== 'string') problems.push('identity must be a string')
  if (!Number.isInteger(req.readFrom) || req.readFrom < 0 || (req.messages.length && req.readFrom >= req.messages.length)) {
    problems.push(`readFrom must be an integer in [0, ${Math.max(0, req.messages.length - 1)}]`)
  }
  return problems.slice(0, 5)
}

/** Analyse a chat: priorities, mentions, deadlines, decisions, tasks, follow-ups, briefing. */
export function analyzeChat(req: AnalyzeRequest): Result<AnalyzeResponse> {
  const problems = validateAnalyzeRequest(req)
  if (problems.length) return fail('INVALID_INPUT', problems.join('; '))
  if (!req.messages.length) return fail('EMPTY_CHAT', 'There are no messages to analyse.')
  try {
    const t0 = performance.now()
    const people = participants(req.messages)
    const analysis = analyze(req.messages, req.identity, req.readFrom, people)
    const briefing = buildBriefing(analysis, req.identity, displayName(req.identity), req.ticked ?? new Set())
    return ok({ apiVersion: ENGINE_API_VERSION, analysis, briefing, people, tookMs: performance.now() - t0 })
  } catch (err) {
    return fail('INTERNAL', `Analysis failed: ${(err as Error).message}`)
  }
}

/** Import a chat export file (WhatsApp .txt/.zip, Telegram .json/.html) into messages. */
export async function importChat(file: Blob, filename: string): Promise<Result<LoadedChat>> {
  if (!(file instanceof Blob)) return fail('INVALID_INPUT', 'Expected a file.')
  if (file.size > MAX_FILE_BYTES) return fail('FILE_TOO_LARGE', `"${filename}" is ${Math.round(file.size / 1048576)} MB. Export "Without media" and try again.`)
  try {
    const chat = await readChatFile(file, filename)
    if (!chat.messages.length) return fail('EMPTY_CHAT', `No messages found in "${filename}". Is it a WhatsApp or Telegram export?`)
    return ok(chat)
  } catch (err) {
    const message = (err as Error).message
    return fail(/Unrecognised|not valid|zip/i.test(message) ? 'UNSUPPORTED_FORMAT' : 'INTERNAL', message)
  }
}

# Engine API (v1.0.0)

The on-device "backend" of **What Did I Miss?** is exposed through one versioned module,
[`app/src/engine/index.ts`](app/src/engine/index.ts). The UI never calls parsers or the rule engine
directly; it goes through this API, which **validates input**, runs the pure `core/` logic, and returns a
**typed result** instead of throwing. Everything runs locally: no request leaves the device.

```
 UI (hooks/components)  ──►  engine API  ──►  core/ (pure)  +  services/ (file I/O)
   handles Result<T>         validate · run · map errors · version
```

## Result type

```ts
type Result<T> = { ok: true; value: T } | { ok: false; error: EngineError }

class EngineError extends Error {
  code: 'INVALID_INPUT' | 'EMPTY_CHAT' | 'FILE_TOO_LARGE' | 'UNSUPPORTED_FORMAT' | 'INTERNAL'
}
```

Callers branch on `ok`. Error `code`s are stable and machine-readable, and `message` is shown to users.

## `importChat(file, filename) → Promise<Result<LoadedChat>>`

Reads a chat export and detects its format.

| Input | Detected as |
|---|---|
| WhatsApp `.txt` (Android or iOS) / iOS `.zip` (`_chat.txt` inside) | `source: 'whatsapp'` |
| Telegram Desktop `result.json` (single chat or full account) / `messages.html` | `source: 'telegram'` |
| Lines of `Name: message` | `source: 'text'` |

```ts
interface LoadedChat { name: string; messages: Message[]; source: 'whatsapp' | 'telegram' | 'text'; me?: string }
interface Message { id: number; ts: Date; author: string; text: string }
```

| Error code | When |
|---|---|
| `FILE_TOO_LARGE` | File is over 50 MB (exports "without media" are far smaller) |
| `UNSUPPORTED_FORMAT` | JSON/HTML that isn't a Telegram export, or an unreadable zip |
| `EMPTY_CHAT` | The file parsed but contained no messages |
| `INVALID_INPUT` | Not a file |

## `analyzeChat(request) → Result<AnalyzeResponse>`

Runs the full analysis: mentions, questions, deadlines (`chrono-node` + Hinglish), decisions, action items,
owners, follow-ups (claimed/done), urgency scoring, and the briefing view-model.

```ts
interface AnalyzeRequest {
  messages: Message[]
  identity: string            // "Shashwat, @shashwat_p, 98765 43210" (may be empty)
  readFrom: number            // index of the first unread message
  ticked?: ReadonlySet<number> // tasks the user marked done
}

interface AnalyzeResponse {
  apiVersion: '1.0.0'
  analysis: Analysis          // scored messages, mentions, actions, decisions, deadlines, stats
  briefing: Briefing          // your tasks by day & priority, next deadline, KPIs, noise ratio
  people: string[]            // participants by message count
  tookMs: number              // engine time, for performance monitoring
}
```

| Error code | When |
|---|---|
| `INVALID_INPUT` | Malformed message (missing author, invalid date), `readFrom` out of range, non-string identity. Up to 5 problems are listed in `message` |
| `EMPTY_CHAT` | `messages` is empty |
| `INTERNAL` | Unexpected failure (reported, never thrown at the UI) |

`validateAnalyzeRequest(request)` returns the same problem list without running the analysis.

## Guarantees

- **Pure and deterministic:** the same request gives the same response; no I/O, no network.
- **Fast:** 10,000 messages are analysed in about 0.2 s (enforced in CI by `src/eval/performance.test.ts`).
- **Untrusted input is validated** at every boundary: files (`importChat`), requests (`analyzeChat`), and
  Telegram Bot API responses (shape-checked in `services/telegramBot.ts`).
- **Tested:** `src/engine/__tests__/engine.test.ts` covers success, validation, empty input and every
  import error code.

## Example

```ts
import { analyzeChat, importChat } from './engine'

const file = await importChat(blob, 'WhatsApp Chat with Fest.txt')
if (!file.ok) return showError(file.error.code, file.error.message)

const res = analyzeChat({ messages: file.value.messages, identity: 'Shashwat', readFrom: 0 })
if (res.ok) console.log(`${res.value.briefing.openTasks} tasks need you`)
```

# Architecture

**What Did I Miss?** is a *local-first* application: the browser is the runtime, and the "backend" is an on-device engine (parsers, rule engine, storage, a GPU-accelerated LLM in a Web Worker). There is deliberately **no server**. This document explains how the pieces fit together and why.

## 1. Layers

```
┌────────────────────────────────────────────────────────────────────────────┐
│ components/  React UI                                                        │
│   layout/ Sidebar · Topbar · ViewTabs      overlays/ Intro · Telegram · Who  │
│   views/  BriefingView · InsightsView* · ChatView*      ui/ Icon · Avatar…   │
│                                                    (* lazy-loaded on demand) │
├────────────────────────────────────────────────────────────────────────────┤
│ hooks/  State orchestration (no rendering)                                   │
│   useChatSession  open chat · identity · read point · analysis · briefing    │
│   useAssistant    model choice · AI summary · reply drafts                   │
│   useTelegramLive bot connection · long-polling · live updates               │
│   useBrowser      online status · install prompt                             │
├────────────────────────────────────────────────────────────────────────────┤
│ engine/  Versioned API (v1.0.0): importChat · analyzeChat                    │
│   validates input · returns Result<T> · stable error codes (ENGINE_API.md)   │
├────────────────────────────────────────────────────────────────────────────┤
│ core/  Pure domain logic (no React, no I/O, fully unit-tested)               │
│   parser · telegramExport · analyze · identity · briefing · insights ·       │
│   calendar · merge · format                                                  │
├────────────────────────────────────────────────────────────────────────────┤
│ services/  Side effects behind small interfaces                              │
│   storage (only persistence layer) · importFile (files, .zip, share target)  │
│   llm (WebLLM engine) · telegramBot (Bot API) · download                     │
├────────────────────────────────────────────────────────────────────────────┤
│ workers/  llm.worker: WebLLM on WebGPU, off the main thread                  │
│ public/sw.js  offline cache + Web Share Target receiver                      │
└────────────────────────────────────────────────────────────────────────────┘
```

**Dependency rule:** arrows only point downward. The UI reaches the domain only through the **engine API** ([`ENGINE_API.md`](ENGINE_API.md)), a versioned contract with validated input and typed errors, so the engine could move into a worker or a different runtime without touching the UI. `core/` imports nothing outside `core/`. `services/` may use `core/` types. `hooks/` combine `core/` and `services/`. `components/` render hook state and never touch storage or the network directly. `App.tsx` is the composition root, about 200 lines of wiring. The linter enforces "no import cycles".

## 2. Data flow

```
 File / paste / WhatsApp share / Telegram bot
        │  services/importFile · services/telegramBot
        ▼
 Message[]  ──── core/parser (WhatsApp) · core/telegramExport (Telegram JSON/HTML) · core/merge
        │
        ▼
 core/analyze(messages, identity, readPoint)        ← pure, ~0.2 s for 10,000 messages
   mentions · deadlines (chrono-node + Hinglish) · decisions · actions · owners ·
   follow-ups (claimed/done) · urgency → score → Urgent / Relevant / FYI
        │
        ├──► core/briefing   view-model: tasks by day & priority, next deadline, KPIs, statuses
        ├──► core/insights   calendar layout, hot topics
        └──► services/llm ──► workers/llm.worker (WebLLM, WebGPU)
                 grounded prompt (top-5 facts or recent messages) → TL;DR · reply drafts
        ▼
 hooks/* hold the state  →  components/* render it
        ▼
 services/storage (this browser only): identity, last visit per chat, Telegram bot state
```

## 3. Key decisions (ADRs)

| # | Decision | Why | Trade-off accepted |
|---|---|---|---|
| 1 | **No backend, static hosting (GitHub Pages)** | The brief requires that chats never leave the device; with no server there is nowhere to send them | No server-side sync or accounts |
| 2 | **On-device LLM (WebLLM/WebGPU) instead of cloud AI APIs** | Cloud APIs would upload the chat. No keys, no quota, works offline | ~1 GB one-time model download; smaller model than cloud |
| 3 | **Hybrid: deterministic rule engine + LLM** | Prioritisation must be instant, explainable and reliable; the LLM only writes prose, grounded on the engine's facts | Rules need maintenance (covered by tests and the accuracy harness) |
| 4 | **LLM in a Web Worker** | Model load and generation never block the UI (measured 0 ms main-thread blocking) | Messages cross a worker boundary |
| 5 | **Pure `core/` layer** | Testable without a browser; reusable (e.g. a future CLI or extension) | Slightly more files |
| 6 | **Single `services/storage` layer** | One place for persistence, failure-tolerant (private mode, quota), stable keys | localStorage only (enough for settings + bot buffer) |
| 7 | **Content Security Policy at build time** | Privacy *enforced* by the browser, not just promised | Adding a network feature means consciously widening the policy |
| 8 | **Official export / Bot API paths only** | No terms-of-service violations, no account-ban risk | iPhone and WhatsApp need an export step |
| 9 | **Lazy-loaded secondary views** | The first screen ships ~107 kB gzipped; Insights/Chat load on demand | A brief "Loading…" the first time a tab opens |
| 10 | **Derived state over effects** in hooks (e.g. a summary belongs to the analysis it was written for) | Avoids cascading renders and stale-state bugs | None |

## 4. Extending it

- **A new chat source** (e.g. Instagram JSON): add a parser in `core/` that returns `Message[]`, register its detection in `services/importFile.ts`, and add a test. Analysis, briefing and AI work unchanged.
- **A new insight**: add a pure function in `core/` (with tests) and render it in a view.
- **A new model**: add it to `MODELS` in `services/llm.ts`. Device detection picks the 32-bit build automatically when needed.

## 5. Performance

| Measure | Result | How |
|---|---|---|
| Parse + analyse 10,000 messages | **~0.2 s** (parse 18 ms, analyse 186 ms, briefing 3 ms) | `src/eval/performance.test.ts`, enforced in CI |
| First load (JS, gzipped) | **~107 kB**; the 6 MB AI engine is never in the initial load | Code-splitting, dynamic import, worker |
| UI blocking during AI generation | **0 ms** of long tasks measured | Web Worker |
| Long chats | Off-screen messages skip layout/paint | CSS `content-visibility: auto` |
| AI on weaker GPUs | Auto-select light model / 32-bit build; retry on failure | `recommendModel()`, `resolveModelId()` |

## 6. Quality gates (CI)

Every push runs **type-check (TypeScript strict) → lint (oxlint: correctness, suspicious, perf, React hooks, no import cycles) → 48 tests (unit, accuracy harness, performance budget) → dependency audit**. Only then does the build and deploy run. A failure anywhere blocks the deploy.

See [`SECURITY.md`](SECURITY.md) for the threat model and [`ACCURACY.md`](ACCURACY.md) for detection accuracy.

# Master Prompt: "What Did I Miss?"

> The master prompt given to the AI coding agent (Claude Code) to build this project. It started as a short brief and was refined during the build; this is the consolidated version that describes the final product.

---

You are a senior full-stack engineer at a 3-hour hackathon. Build a polished, demo-ready **AI micro-app** called **"What Did I Miss?"** that solves *The Unread Problem*: helping users quickly understand and prioritize important information from overwhelming chat conversations.

## 1. Hard requirements (from the challenge brief)
1. **Summarize** long and unread conversations.
2. **Identify** important messages, decisions and action items.
3. **Prioritize** information by urgency and relevance.
4. **Highlight** mentions, deadlines and tasks the user may have missed.
5. **Local-first**: conversations, data and summaries must **never leave the user's device**.

## 2. Non-negotiable constraints (they follow from requirement 5)
- **No backend, no database, no cloud AI APIs, no API keys, no `.env`.** A static site only (GitHub Pages).
- **On-device AI**: run an open-source LLM in the browser with **WebLLM on WebGPU**. Default to **Qwen 2.5 1.5B (q4f16)**, with Llama 3.2 1B and 3B as options. Detect the GPU: use the q4f32 build when `shader-f16` is missing, the light model on low-memory devices, and retry with the light model if loading fails. Run the engine in a **Web Worker** so the UI never blocks.
- **Enforce privacy with a Content Security Policy** (injected at build): `connect-src` allows only the model hosts (huggingface.co, *.hf.co, raw.githubusercontent.com) plus `api.telegram.org`, which is used only if the user connects their own Telegram bot. Verify that a fetch to any other domain is blocked.
- **Offline**: a service worker caches the app shell; WebLLM caches model weights. It must work with Wi-Fi off after the first load.
- **Official data paths only** (no scraping or unofficial WhatsApp Web libraries).

## 3. Architecture: hybrid intelligence
- **Layer 1, deterministic rule engine** (TypeScript, instant, explainable, works without a GPU):
  - Mentions of the user (name, nicknames, `@username`, phone number), questions aimed at them, `@everyone`.
  - **Deadlines** via `chrono-node`, resolved against each message's timestamp. Count a deadline when there's an explicit cue (by/before/due/till/expires/meeting…) **or** a time phrase inside a request addressed to a specific person.
  - **Decisions** ("decided", "final:", "let's go with", "agreed", "pakka"…), **action items** ("can you", "please", "send", "bhej dena", "kar do"…), **urgency** ("urgent", "asap", "eod", "!!").
  - **Task owner**: the user if mentioned; else a participant named in the message; else the addressee of "Name can you…" / "@name please…", even if they never posted.
  - **Hinglish normalisation** before parsing: "kal subah 9 baje tak" → "tomorrow morning by 9", "aaj raat" → tonight, "jaldi" → asap. Leave bare "kal" alone (it means both yesterday and tomorrow).
  - Score every message → **Urgent / Relevant / FYI**, with reason chips ("mentions you", "due Fri 5 PM").
  - **Follow-ups**: read the replies after each task. "I'll take it" / "on it" / "will do" / "kar dunga" **claims** it (an unassigned ask takes the claimer as owner); "done" / "sent" / "updated ✅" from the claimer or owner marks it **done**. Never let one person claim a group-wide ask ("everyone fill your rows"). Show "Arjun is on it" / "done by Sneha", and tick the user's own completed tasks automatically.
- **Layer 2, on-device LLM** (temperature 0, so output is consistent):
  - **Catch-up TL;DR**: 2–3 sentences grounded on Layer 1's **top 5 facts only** (more context confuses a 1.5B model). Pass the current time, each fact's sender, who it's for and an absolute deadline, so the model doesn't swap names or repeat stale "tomorrow". If nothing (or little) is flagged important, pass the **actual recent messages** instead and say plainly that nothing needs the user. Never invent deadlines. Start with "You", no greetings or brackets, add a repetition guard.
  - **One-tap reply drafts**: for each "Needs you" task, draft a short first-person reply ("Got it, I'll accept the GitHub invite ASAP. Thanks Karthik!") using a one-shot example, never naming the user, with a Copy button.

## 4. Inputs
- **WhatsApp**: Android and iOS `.txt` (handle `\u200e` direction marks, the `\u202f` narrow space before AM/PM, the `~ Name` prefix for non-contacts, multi-line messages, system lines), iOS **`.zip`** (unzip `_chat.txt` with the browser's `DecompressionStream`), and the **Android share menu** via a Web Share Target in the manifest. The service worker receives the POST and hands the file to the app locally.
- **Date order**: detect day-first vs month-first **once per file** (a number > 12 decides; otherwise pick the order whose timestamps run forwards; final tie-break by time zone, not browser language).
- **Telegram Desktop** exports: `result.json` (single chat or full account; flatten rich text, skip service and caption-less media) and `messages.html` (joined messages inherit the sender; parse `UTC±hh:mm` offsets). Accept **several files at once** and merge them (Telegram splits big chats into `messages.html`, `messages2.html`…), deduplicating by time + sender + text.
- **Live Telegram via the user's own bot** (official Bot API, browser-direct, no server of ours): a "Connect Telegram" panel explains @BotFather `/newbot` → `/setprivacy` Disable → add the bot to the group → paste the token. **Extract the token from whatever is pasted** (BotFather's whole message, a `bot` prefix, quotes, invisible characters, or spaces and line breaks added while copying: gather the 35-character secret after the colon). Long-poll `getUpdates` with simple GET requests (no CORS preflight), store the token and messages only in `localStorage`, update the open chat live, explain 401/404/409 errors in plain words, and let "Disconnect" delete everything. Telegram queues a bot's messages for 24 hours, which fits "what did I miss".
- **Paste** any `Name: message` chat. **Drag and drop** anywhere on the page.

## 5. Identity and "unread"
- "Who are you?" is **free text** (comma-separated aliases, `@username`, phone number). Suggest everyone who posted **plus** anyone @mentioned. Remember it on the device, and ask once when a real chat is opened.
- "Unread" defaults to everything after the user's **own last message**. A **"Since you left" picker** on the home screen offers *since my last visit / since my last message / last hour / today / last 24 hours / everything*, and the "Last read" slider stays in Insights.
- **Remember the last visit per chat** (on-device): re-importing the same group later starts *since my last visit*, so only new messages count.

## 6. UX: answer first, details on demand
- **Dark glass shell on an orange glow**: an icon sidebar, plus a top bar with an "On-device · 0 bytes sent" status, local chat search, a task bell and an identity avatar. **Numbered view tabs** under it: `01 Briefing · 02 Insights · 03 Full chat`.
- **Briefing (home), minimal**: a source badge (Demo / WhatsApp / Telegram / Telegram live), the "Since you left" picker, a **"Hi <name> 👋"** greeting (only for a real name), "You missed **74** messages. **4 need you.**" (correct singular/plural), three facts (due in 24h, decisions, % chatter), the inline AI catch-up, an orange **Next up** card, **Needs you** grouped Today / Tomorrow / Upcoming with High / Medium / Low priority (**the top open task highlighted**, each with a Reply button), and recent decisions.
- **Insights**: KPI cards, a 6-day **deadline calendar** with event chips and an **"Add to calendar"** button (an `.ics` file with 1-hour reminders, generated on-device), hot topics, a priority inbox (paper cards), an unread dot map, a noise gauge, a **chat-activity chart** with hoverable urgent markers, decisions, and others' tasks with claimed/done status.
- **Full chat** with highlighted mentions, an unread divider and search; every insight **jumps to the source message**.
- **Opens straight into a realistic demo chat** (an 80-message college-fest group with hidden urgent asks), with a full-screen "You're looking at a demo chat" notice **once per browser session** (offering: explore the demo, open my export, connect Telegram, paste a chat).
- **Installable** app with an icon.

## 7. Quality
- **Layered architecture**: pure `core/` (no React, no I/O), `services/` (storage, import, LLM, Telegram), `hooks/` (state orchestration), `components/` (layout, views, overlays, ui), with a ~200-line `App.tsx` composition root. One fail-safe storage layer.
- **Engine API** (`src/engine/`, versioned `1.0.0`): the UI reaches the domain only through `importChat` and `analyzeChat`, which **validate input**, return a typed `Result<T>` instead of throwing, and use stable error codes (`INVALID_INPUT`, `EMPTY_CHAT`, `FILE_TOO_LARGE`, `UNSUPPORTED_FORMAT`, `INTERNAL`). Shape-check all untrusted network data (Telegram Bot API responses). Document the contract in `ENGINE_API.md`. Lazy-load the secondary views. Document it in `ARCHITECTURE.md` (layers, data flow, ADRs, performance) and `SECURITY.md` (threat model, stored data, allowed network).
- **TypeScript strict** and **oxlint** (correctness, suspicious, perf, React hooks, no import cycles, no `any`).
- **Vitest** (48 tests): parsers (WhatsApp, Telegram, date order), identity, the rule engine, follow-ups, the briefing view-model, calendar export, merging, storage, import safety, bot-token extraction, the engine API (validation and every error code), plus a **performance budget** (10,000 messages parsed and analysed in about 0.2 s).
- An **accuracy harness** with hand-labelled chats (the dev set, an English held-out set with traps, and a Hinglish held-out set) reporting precision / recall / F1 per detector. Publish the numbers **with caveats** in `ACCURACY.md`.
- **GitHub Actions**: a `verify` job (type-check → lint → tests → `npm audit`) must pass before the `deploy` job builds and publishes to GitHub Pages.

## 8. Deliverables
- A public GitHub repo, auto-deployed to GitHub Pages.
- A README that maps **every challenge requirement → feature → code**, explains **why** each design decision serves the brief (no APIs, no backend, no secrets, CSP), tells judges how to verify the privacy claims, and lists honest limitations.
- This master prompt as `MASTER_PROMPT.md`.

Prioritize a flawless happy path with the demo chat over breadth of features. Ship early, deploy often, and test with real exports.

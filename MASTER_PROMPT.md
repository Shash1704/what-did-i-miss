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
- **Enforce privacy with a Content Security Policy** (injected at build): `connect-src` allows only the model hosts (huggingface.co, *.hf.co, raw.githubusercontent.com). Verify that a fetch to any other domain is blocked.
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
- **Layer 2, on-device LLM**: writes a 2–3 sentence TL;DR **grounded on Layer 1's top facts**. Pass the current time, each fact's sender, who it's for, and an absolute deadline, so a small model doesn't swap names or repeat stale "tomorrow". Start with "You", no greetings, add a repetition guard.

## 4. Inputs
- **WhatsApp**: Android and iOS `.txt` (handle `‎` marks, the ` ` space before AM/PM, the `~ Name` prefix for non-contacts, multi-line messages, system lines), iOS **`.zip`** (unzip `_chat.txt` with the browser's `DecompressionStream`), and the **Android share menu** via a Web Share Target in the manifest. The service worker receives the POST and hands the file to the app locally.
- **Date order**: detect day-first vs month-first **once per file** (a number > 12 decides; otherwise pick the order whose timestamps run forwards; final tie-break by time zone, not browser language).
- **Telegram Desktop** exports: `result.json` (single chat or full account; flatten rich text, skip service and caption-less media) and `messages.html` (joined messages inherit the sender; parse `UTC±hh:mm` offsets).
- **Paste** any `Name: message` chat. **Drag and drop** anywhere on the page.

## 5. Identity and "unread"
- "Who are you?" is **free text** (comma-separated aliases, `@username`, phone number). Suggest everyone who posted **plus** anyone @mentioned. Remember it on the device, and ask once when a real chat is opened.
- "Unread" defaults to everything after the user's **own last message**, adjustable with a "Last read" slider.

## 6. UX: answer first, details on demand
- **Dark glass shell on an orange glow**: an icon sidebar, plus a top bar with an "On-device · 0 bytes sent" status, local chat search, a task bell and an identity avatar.
- **Briefing (home), minimal**: "You missed **74** messages. **4 need you.**", three facts (due in 24h, decisions, % chatter), the inline AI catch-up, an orange **Next up** card, **Needs you** grouped Today / Tomorrow / Upcoming with High / Medium / Low priority, and recent decisions.
- **Insights**: KPI cards, a 6-day **deadline calendar** with event chips, hot topics, a priority inbox (paper cards), an unread dot map, a noise gauge, a **chat-activity chart** with hoverable urgent markers, decisions and others' tasks.
- **Full chat** with highlighted mentions, an unread divider and search; every insight **jumps to the source message**.
- **Opens straight into a realistic demo chat** (an 80-message college-fest group with hidden urgent asks), with a full-screen "You're looking at a demo chat" notice on first launch.
- **Installable** app with an icon.

## 7. Quality
- **Vitest** unit tests for the parsers, identity matching and rule engine.
- An **accuracy harness** with hand-labelled chats (the dev set, an English held-out set with traps, and a Hinglish held-out set) reporting precision / recall / F1 per detector. Publish the numbers **with caveats** in `ACCURACY.md`.
- **GitHub Actions**: run the tests before building; a failing test blocks the deploy to GitHub Pages.

## 8. Deliverables
- A public GitHub repo, auto-deployed to GitHub Pages.
- A README that maps **every challenge requirement → feature → code**, explains **why** each design decision serves the brief (no APIs, no backend, no secrets, CSP), tells judges how to verify the privacy claims, and lists honest limitations.
- This master prompt as `MASTER_PROMPT.md`.

Prioritize a flawless happy path with the demo chat over breadth of features. Ship early, deploy often, and test with real exports.

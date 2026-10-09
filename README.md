# What Did I Miss?

**Catch up on an overwhelming group chat in seconds, with an AI that runs entirely on your device.**

[![Test and deploy](https://github.com/Shash1704/what-did-i-miss/actions/workflows/deploy.yml/badge.svg)](https://github.com/Shash1704/what-did-i-miss/actions/workflows/deploy.yml)

**Live app:** https://shash1704.github.io/what-did-i-miss/ · **Accuracy report:** [`ACCURACY.md`](ACCURACY.md) · **Master prompt:** [`MASTER_PROMPT.md`](MASTER_PROMPT.md)

> Built for the PALS challenge **"The Unread Problem: What Did I Miss?"**: *build a simple AI micro-app that helps users quickly understand and prioritize important information from overwhelming chat conversations.*

---

## For judges: the 30-second version

- **Every requirement in the brief is covered:** summaries, important messages, decisions, action items, urgency and relevance ranking, mentions, deadlines and tasks. See the [mapping table](#how-we-meet-the-challenge) below, with links to the code.
- **Local-first is enforced, not just promised.** There's no server, no cloud AI API, no API keys and no `.env`. The AI model runs **in the browser on your own GPU**, and a **Content Security Policy** makes the browser itself refuse to send data anywhere except the model download.
- **It works with real chats today:** WhatsApp (Android share menu, `.txt`, iPhone `.zip`), Telegram Desktop exports (JSON or HTML), or any pasted chat.
- **The accuracy is measured:** 28 automated tests plus an accuracy harness on hand-labelled chats, run in CI. A failing test blocks deployment.
- **It opens straight into a working demo:** no setup, no sign-up, nothing to install.

---

## How we meet the challenge

The brief listed five things a solution "can focus on". We built all five.

| Challenge asks for | What we built | Where to see it | Code |
|---|---|---|---|
| **Summarizing long and unread conversations** | A 2–3 sentence **AI catch-up** written by an on-device LLM, grounded on the messages the rule engine flagged so a small model stays accurate. What counts as unread defaults to everything after **your own last message**, adjustable with the **"Last read"** slider (Insights → deadline calendar). | Briefing → *AI catch-up* | [`llm.ts`](app/src/lib/llm.ts), [`llm.worker.ts`](app/src/lib/llm.worker.ts) |
| **Identifying important messages, decisions and action items** | The rule engine flags **decisions** ("let's go with…", "final:", "pakka"), **action items** ("can you…", "please send…", "bhej dena") and **who owns each task**, even people who never posted. | Briefing → *Needs you*, *Decided while you were away*; Insights → *Others' tasks* | [`analyze.ts`](app/src/lib/analyze.ts) |
| **Prioritizing by urgency and relevance** | Every message is scored and ranked **Urgent / Relevant / FYI**, and your tasks get **High / Medium / Low** priority grouped **Today / Tomorrow / Upcoming**. Each item shows *why* it was ranked ("mentions you", "due Fri 5 PM"). | Briefing → *Needs you*; Insights → *Priority inbox* | [`analyze.ts`](app/src/lib/analyze.ts) |
| **Highlighting mentions, deadlines and tasks you may have missed** | **Mentions** match your name, nicknames, `@username` or phone number. **Deadlines** turn "by tomorrow 3pm" or "kal subah 9 baje tak" into real dates on a **deadline calendar**. A **"Next up"** card shows the most urgent item, and every item **jumps to the original message**. | Briefing → *Next up*; Insights → *Deadline calendar*, *Chat activity* | [`identity.ts`](app/src/lib/identity.ts), [`analyze.ts`](app/src/lib/analyze.ts) |
| **Local-first: conversations, data and summaries never leave the device** | No backend, no cloud AI, no API keys. The LLM runs in-browser on WebGPU; parsing and scoring run in-browser. The network is **locked by a Content Security Policy**, and the app works **offline** after the first load. | Shield icon (sidebar); *On-device · 0 bytes sent* pill | [`vite.config.ts`](app/vite.config.ts), [`sw.js`](app/public/sw.js) |

---

## Why we built it this way

Every major decision traces back to the brief. This section explains the reasoning.

### 1. No cloud AI APIs (no OpenAI, Claude or Gemini)
**Why:** the brief requires that conversations and summaries *never leave the user's device*. Calling any hosted AI API means uploading the chat to someone else's server, which breaks that requirement outright.
**Instead:** we run an **open-source model (Qwen 2.5, 1.5B parameters, 4-bit quantized)** inside the browser using **WebLLM** on **WebGPU**. The model downloads once (~1 GB), is cached, and then works **with Wi-Fi off**.
**Trade-off we accepted:** a 1.5B on-device model is less fluent than a frontier cloud model. We compensate with the hybrid design in point 4.

### 2. No backend server and no database
**Why:** a server is somewhere data *could* go. With no server, there is **nowhere to send a chat**. The app is a static site on **GitHub Pages**, which can only serve files and can't run code.
**Bonus:** nothing to host, scale, secure or pay for, and nothing that can go down during judging.

### 3. No `.env`, no API keys, no secrets
**Why:** there's nothing secret to configure. On a static site, any key placed in a `.env` would be bundled into public JavaScript anyway, so a key-based design would be both a **privacy** and a **security** problem.
**Result:** clone and run with **zero configuration**, with nothing to leak and no quota to run out mid-demo.

### 4. Hybrid intelligence: a rule engine plus a small on-device LLM
**Why:** the brief asks for *quick* understanding and *prioritization*. Those need to be instant, explainable and reliable, which small LLMs alone are not.
- **Layer 1, the rule engine** (TypeScript, runs in milliseconds, no GPU needed): detects mentions, questions, deadlines (via `chrono-node`), decisions, action items, owners and urgency, then scores every message. It's **explainable**: every flag shows its reason.
- **Layer 2, the on-device LLM:** writes the human-readable catch-up, **grounded on Layer 1's findings** so the small model doesn't invent tasks.
- **Graceful degradation:** if a device has no WebGPU, everything except the prose summary still works.

### 5. Privacy that's enforced, not just promised
**Why:** "we don't upload your data" is a promise; we wanted something verifiable.
**How:** a **Content Security Policy** ([`vite.config.ts`](app/vite.config.ts)) lets the page connect **only** to the AI model hosts (Hugging Face, GitHub raw). We tested it: a deliberate `fetch` to another domain is **blocked by the browser**. Even a bug or a compromised dependency couldn't send a chat out.

### 6. Official ways to get chats in (no scraping, no terms-of-service violations)
**Why:** unofficial "WhatsApp Web" libraries break WhatsApp's terms, risk users' accounts getting banned, and would route data through extra software.
**Instead:** we use each app's **official export**:
- **WhatsApp:** *Export chat*. On Android the installed app appears **in WhatsApp's share menu** (Web Share Target), two taps from chat to briefing. iPhone `.zip` exports are unzipped in the browser.
- **Telegram:** Telegram Desktop *Export chat history* (JSON or HTML).
- **Anything else:** paste `Name: message` lines (Slack, Discord, Teams…).

### 7. A minimal interface: answer first, details on demand
**Why:** an app about *overwhelm* must not overwhelm. The home screen shows only what you need to act on: "**You missed 74 messages. 4 need you.**", the AI catch-up, one *Next up* card, your to-dos and recent decisions. Charts, calendar, topics and the full inbox sit one click away under **Insights**, and the full chat is a third tab.

### 8. It's your perspective, even if you never posted
**Why:** in real groups you're often a lurker. "Who are you?" is **free text** (name, nicknames, `@username`, phone number), so mentions like `@919876543210` are caught too. It's remembered on the device only.

### 9. Accuracy is measured, not assumed
**Why:** "prioritize important information" is only useful if it's right.
**How:** 28 unit tests plus an **accuracy harness** over hand-labelled chats (an English held-out chat with deliberate traps, and a Hinglish chat). **Before tuning**, on chats it had never seen, the engine scored **96%** and **79%** macro-F1 with **100% precision** (no false alarms). The gaps it revealed (implicit deadlines, Hinglish) are now fixed. Full numbers and caveats are in [`ACCURACY.md`](ACCURACY.md). CI runs everything before each deploy.

### 10. Smooth on ordinary laptops
**Why:** a demo that freezes looks broken. The LLM runs in a **Web Worker**; we measured **0 ms of UI blocking** during a full summary. The model is selectable (Qwen 2.5 1.5B / Llama 3.2 1B / 3B) to suit weaker GPUs.

---

## Verify the privacy claims yourself

1. **Network tab:** open DevTools → Network, load a chat and generate a summary. The only external requests are the model files from Hugging Face; your chat is never in a request.
2. **Airplane mode:** load the app once with the model cached, turn Wi-Fi off, reload, and summarize again. It still works.
3. **The lock:** view the page source and you'll see the `Content-Security-Policy` meta tag listing the only allowed hosts. In the console, `fetch('https://example.com')` is refused.
4. **No secrets:** there's no `.env`, no API key and no server code anywhere in the repo.

---

## Features

- **Briefing (home):** headline count, AI catch-up, *Next up*, *Needs you* (grouped and prioritized), recent decisions
- **Insights:** stat cards, 6-day deadline calendar, hot topics, priority inbox, unread map, noise-filtered gauge, chat-activity chart with urgent markers
- **Full chat:** highlighted messages, an unread divider, and on-device search
- **Inputs:** WhatsApp (Android share target, `.txt`, iPhone `.zip`), Telegram Desktop (`result.json` / `messages.html`), paste, or drag-and-drop anywhere
- **Understands:** Android and iPhone formats, US and Indian date order (auto-detected), WhatsApp's `~ Name` for non-contacts, Hinglish ("kal tak", "aaj raat", "pakka", "jaldi")
- **Installable app** with an offline cache; opens straight into a demo chat with a first-launch notice

## Architecture

```
 WhatsApp / Telegram export · share menu · paste
                     │
                     ▼
   ┌──────────────────────────────┐
   │ Import (in browser)          │  WhatsApp .txt/.zip · Telegram JSON/HTML
   │ date-order detection, names  │  → one common message format
   └──────────────┬───────────────┘
                  ▼
   ┌──────────────────────────────┐      ┌───────────────────────────────┐
   │ Layer 1: rule engine         │ ───▶ │ Layer 2: on-device LLM        │
   │ mentions · deadlines ·       │ facts│ Qwen 2.5 via WebLLM + WebGPU   │
   │ decisions · tasks · owners · │      │ in a Web Worker               │
   │ urgency → score & priority   │      │ → grounded 2–3 sentence TL;DR │
   └──────────────┬───────────────┘      └───────────────┬───────────────┘
                  └──────────────┬───────────────────────┘
                                 ▼
                 React dashboard (Briefing · Insights · Chat)

   Content Security Policy: network locked to model hosts only. No server, no database, no API keys.
```

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| UI | React 19 + TypeScript, Vite, hand-written CSS | Fast, typed, no heavy UI framework |
| On-device AI | WebLLM (MLC) on WebGPU; Qwen 2.5 1.5B (default), Llama 3.2 1B/3B, 4-bit | Runs a real LLM in the browser with no server |
| Date understanding | `chrono-node` + custom Hinglish normalisation | "by tomorrow 3pm" or "kal subah 9 baje tak" → a real date |
| Import | Custom parsers; browser `DecompressionStream` for `.zip`; `DOMParser` for Telegram HTML | No upload, no extra dependencies |
| App platform | Service worker, Web App Manifest, Web Share Target | Offline, installable, WhatsApp share on Android |
| Privacy | Content Security Policy | The browser enforces "no data leaves" |
| Quality | Vitest (28 tests) + accuracy harness, GitHub Actions gate | Measured accuracy, no broken deploys |
| Hosting | GitHub Pages (static) | No server exists to receive data |

## Project structure

```
app/src/
  App.tsx                 Briefing / Insights / Chat views
  components/ActivityChart.tsx
  lib/parser.ts           WhatsApp parser + date-order detection
  lib/telegram.ts         Telegram Desktop JSON/HTML import
  lib/importFile.ts       File detection, .zip, WhatsApp share-target hand-off
  lib/analyze.ts          Rule engine: mentions, deadlines, decisions, tasks, urgency, Hinglish
  lib/identity.ts         "Who are you?" (names, @usernames, phone numbers)
  lib/insights.ts         Topics, calendar layout
  lib/llm.ts, llm.worker.ts  On-device LLM (WebLLM in a Web Worker)
  lib/__tests__/          Unit tests
  eval/accuracy.test.ts   Accuracy harness on labelled chats
app/public/sw.js          Offline cache + share-target receiver
app/vite.config.ts        Build config + Content Security Policy
```

## Run it locally

Requires **Node 20.19+ or 22.12+**. For the AI summary, use a WebGPU browser (desktop **Chrome** or **Edge**, or recent Safari).

```bash
cd app
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests + accuracy harness
npm run eval       # print the accuracy tables
```

## Honest limitations

- The **first AI run downloads ~1 GB** (then it's cached and works offline). Without WebGPU, everything except the prose summary still works.
- A 1.5B on-device model occasionally credits a request to the wrong person; the structured lists from the rule engine are the source of truth.
- **iPhone** can't put web apps in the share menu, so iPhone users export → save → open. Telegram export requires **Telegram Desktop**.
- The accuracy test chats are small and written by us (see caveats in [`ACCURACY.md`](ACCURACY.md)).

## Demo script (2 minutes)

1. **Hook:** "You were in labs for 4 hours. 74 unread messages. What did you miss?"
2. The app opens on the demo chat: "**You missed 74 messages. 4 need you.**" *Next up:* the sponsor deck due at 5 PM, buried among paneer-puff chatter.
3. Click **Summarize**: the on-device AI writes the catch-up in about 3 seconds.
4. **Insights:** deadline calendar, chat-activity spikes, hot topics. Click any item and it jumps to the original message.
5. **Privacy:** turn Wi-Fi off, reload, summarize again. Still works. *"Your chat never left this laptop, and the browser wouldn't let it."*
6. **Real chats:** drop a WhatsApp or Telegram export, or share from WhatsApp on Android.

## Roadmap

- Live Telegram connection through a user-owned bot (Telegram's official Bot API; still no server of ours)
- Multiple chats at once ("Across 4 groups, 7 things need you")
- One-tap reply drafts written on-device
- Optional, clearly labelled cloud fallback for devices without a GPU (off by default)

## Built with AI

This project was built with an AI coding assistant (Claude Code), starting from the prompt in [`MASTER_PROMPT.md`](MASTER_PROMPT.md) and refined iteratively.

# 👀 What Did I Miss?

**Catch up on an overwhelming group chat in 10 seconds, with an AI that never sends your messages anywhere.**

> Built for the PALS hackathon challenge **"The Unread Problem — What Did I Miss?"**

**Live demo:** https://shash1704.github.io/what-did-i-miss/ · **Master prompt:** [`MASTER_PROMPT.md`](MASTER_PROMPT.md)

---

## The problem
You step away for a few hours and come back to 200 unread messages. Somewhere between the memes and the "👍"s are
a task with your name on it, a deadline at 5pm, and a decision that changes your plans. Reading everything takes ages;
skimming means you miss things. And pasting private chats into a cloud AI is a privacy nightmare.

## The solution
Drop in a chat export and instantly get:

| | Feature | How |
|---|---|---|
| 🧠 | **AI briefing**: TL;DR, decisions, *your* tasks, others' tasks | Small LLM (Qwen 2.5 / Llama 3.2) running **in the browser** via WebGPU (WebLLM) |
| 🎯 | **Priority inbox**: 🔴 Urgent / 🟡 Relevant / ⚪ FYI | Explainable scoring engine; every card shows *why* ("mentions you", "due Fri 5 PM") |
| 📌 | **Mentions & questions aimed at you** | Name / @mention detection, personalized via "I am" selector |
| ⏰ | **Deadline radar**: "by tomorrow 3pm" → real date, sorted soonest-first | `chrono-node` natural-language date parsing, anchored to each message's timestamp |
| ✅ | **Your to-dos** checklist, **Decisions** log, **Others' tasks** | Action / decision pattern detection + owner extraction |
| 🕒 | **"Since you left" slider** | Pick your last-read point; everything recomputes instantly |
| ↗ | **Jump to source** | Every insight links back to the original message, highlighted in the full chat |

## 🔒 Local-first, by design
- **No backend. No API keys. No analytics.** It's a static site; there's no server to send data to.
- Parsing, scoring, and the LLM all run **inside your browser tab**.
- Model weights are downloaded once and cached; the app shell is cached by a service worker.
  **Turn Wi-Fi off and it still works.**
- If a device has no WebGPU, the app falls back to the rule engine, which still runs fully offline.

## Architecture
```
 WhatsApp .txt / pasted text
            │
            ▼
   ┌─────────────────┐     ┌──────────────────────────────────────────┐
   │  Parser          │──▶ │  Layer 1: Rule engine (instant, offline) │
   │  Android / iOS / │     │  mentions · questions · deadlines        │
   │  "Name: msg"     │     │  decisions · actions · urgency → score   │
   └─────────────────┘     └──────────────┬───────────────────────────┘
                                          │ flagged highlights (grounding)
                                          ▼
                           ┌──────────────────────────────────────────┐
                           │  Layer 2: On-device LLM (WebLLM/WebGPU)  │
                           │  TL;DR · decisions · my tasks · others'  │
                           └──────────────┬───────────────────────────┘
                                          ▼
                              Dashboard (React) — nothing leaves the tab
```
Layer 1 grounds Layer 2: the LLM gets the detected highlights alongside the transcript, so a small model
produces accurate, non-hallucinated briefings.

## Run locally
```bash
cd app
npm install
npm run dev
```
Open http://localhost:5173 → **Try the demo chat**. For the AI briefing, use desktop Chrome or Edge (WebGPU).

## Demo script (2 min)
1. **Hook:** "You were in labs for 4 hours. 74 unread messages. What did you miss?"
2. Click **Try the demo chat**. Stats appear instantly: 6 urgent, 4 mentions, 4 tasks for you.
3. Show **Your to-dos**: the sponsor deck due *today 5pm*, buried in paneer-puff chatter.
4. Click **view in chat ↗**: it jumps to the exact message, highlighted.
5. Click **✨ Summarize**: the on-device LLM streams the briefing.
6. **Turn Wi-Fi off** → the badge flips to ✈ offline → regenerate. Still works. *Your chats never left the laptop.*

## Tech
React + TypeScript + Vite · WebLLM (MLC) · chrono-node · GitHub Pages (static) · Service Worker

## Built with AI
This project was built with Claude Code from a single master prompt: see [`MASTER_PROMPT.md`](MASTER_PROMPT.md).

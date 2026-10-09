# Master Prompt — "What Did I Miss?"

> The single prompt given to the AI coding agent (Claude Code) to build this project.

---

You are a senior full-stack engineer at a 3-hour hackathon. Build a polished, demo-ready **AI micro-app** called **"What Did I Miss?"** that solves *The Unread Problem*: helping users quickly understand and prioritize important information from overwhelming chat conversations.

## Hard requirements (from the problem statement)
1. **Summarize** long and unread conversations.
2. **Identify** important messages, decisions, and action items.
3. **Prioritize** information by urgency and relevance.
4. **Highlight** mentions, deadlines, and tasks the user may have missed.
5. **Local-first**: conversations, data, and summaries must **never leave the user's device**. No cloud LLM APIs, no backend, no analytics.

## Architecture
- **Vite + React + TypeScript**, fully static, deployed to **GitHub Pages**.
- **Two-layer intelligence**, both running in the browser:
  - **Layer 1 — deterministic engine (instant, always works, offline):**
    - Parse WhatsApp `.txt` exports (Android + iOS formats), and a generic `Name: message` fallback.
    - Detect **@mentions / name mentions** of the user, **questions directed at the user**,
      **deadlines** (natural-language dates via `chrono-node`, resolved against the message timestamp),
      **decisions** ("let's go with", "decided", "final", "confirmed"...),
      **action items** ("can you", "please", "need to", "todo", "assign"...),
      **urgency** keywords ("urgent", "asap", "eod", "today", "!!!").
    - Score each message → **🔴 Urgent / 🟡 Relevant / ⚪ FYI**.
  - **Layer 2 — on-device LLM via WebLLM (WebGPU):** a small instruct model
    (e.g. Qwen2.5-1.5B-Instruct q4) generates a TL;DR, key decisions, and action items,
    *grounded* on the Layer-1 highlights. Model weights are cached in the browser after the first download,
    so it works **with Wi-Fi off**. If WebGPU is unavailable, the app degrades gracefully to Layer 1.
- **"Since you left" slider**: choose a cutoff time → only messages after it count as unread.
- **"I am"** selector: pick which participant you are, so mentions/tasks are personalized.

## UX
- Landing: drop zone for a chat export + "Paste text" + **"Try demo chat"** button (bundled realistic,
  messy 150+ message college-fest group chat containing hidden urgent asks, decisions, and deadlines).
- Dashboard:
  - Header stats: unread count, mentions, deadlines, urgent items, "time saved".
  - **AI TL;DR** card (streams in token by token).
  - **Priority inbox**: cards grouped Urgent / Relevant / FYI, each with reason chips
    ("mentions you", "deadline: Fri 5 PM", "decision") and a jump-to-original link.
  - **Action items** checklist with deadlines and owners.
  - **Decisions** timeline.
  - **Deadlines** sorted soonest-first with relative time ("in 3h").
  - Full chat view with highlighted messages.
- **Privacy badge**: "100% on-device · 0 bytes sent" with a live network/offline indicator.
- Clean, modern dark UI, responsive, no UI framework bloat.

## Deliverables
- Source in a public GitHub repo, auto-deployed to GitHub Pages via GitHub Actions.
- README: problem, solution, architecture diagram, privacy guarantees, how to run, demo script.
- This master prompt committed as `MASTER_PROMPT.md`.

Prioritize: a flawless happy path with the demo chat > breadth of features. Ship early, deploy often.

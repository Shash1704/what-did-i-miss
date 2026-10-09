# Security & privacy

## Threat model

| Asset | Threat | Mitigation |
|---|---|---|
| **Chat contents** | Sent to a server or third party | No backend exists. All parsing, analysis and AI run in the browser tab. A **Content Security Policy** restricts `connect-src` to the model hosts (Hugging Face, GitHub raw) and `api.telegram.org`, which is used only if *you* connect your own bot. Any other request is **blocked by the browser**; tested with a deliberate `fetch` to another domain. |
| Chat contents | A compromised dependency tries to exfiltrate data | Same CSP: even injected code cannot reach an unlisted domain. Production dependencies are audited in CI (`npm audit --omit=dev --audit-level=high`, currently 0 vulnerabilities). |
| Chat contents | Malicious export file (script injection, huge file) | Files are parsed as **text**, never executed. React escapes all rendered text, and the app never uses `innerHTML`. Telegram HTML is read with `DOMParser`, which creates an inert document (no scripts run). Files over **50 MB** are rejected before reading. |
| Page URL / context | Leaked to other sites via the `Referer` header | `<meta name="referrer" content="no-referrer">` |
| **Telegram bot token** | Theft or misuse | Entered by the user, stored only in this browser's `localStorage`, sent **only** to `api.telegram.org` over HTTPS, masked in the input field. "Disconnect & forget" deletes the token and every stored message. The token only grants access to *that bot* (which you created); revoke it any time with `/revoke` in @BotFather. |
| Telegram token | Pasted with extra text and sent somewhere wrong | The token is extracted by a strict pattern (`digits:35 chars`) before any request; the request URL is fixed to the Telegram API. |
| AI output | Hallucinated tasks or deadlines | The LLM is grounded on the rule engine's facts, runs at temperature 0 and is told never to invent deadlines. The structured lists (tasks, deadlines, decisions) come from the deterministic engine, not the LLM. |
| Availability | Storage blocked (private mode, quota) | Every storage access goes through `services/storage.ts`, which fails safe; the app keeps working in memory. |

## What is stored, and where

All of it lives **in this browser only**. Nothing is synced.

| Data | Storage | Lifetime |
|---|---|---|
| Your identity ("Who are you?") | `localStorage` | Until you change it or clear site data |
| Last-seen time per chat (for "since my last visit") | `localStorage` | Same |
| Live-Telegram bot token + received messages (max 3,000 per chat) | `localStorage` | Until "Disconnect & forget" |
| AI model weights (public, open-source) | Cache Storage (WebLLM) | Until you clear site data |
| Demo-notice seen flag | `sessionStorage` | Until the tab closes |

Chat exports you open are **never persisted**: they live in memory and are gone when the tab closes.

## Network requests the app can make

1. Its own static files (GitHub Pages).
2. AI model weights and WebGPU kernels: `huggingface.co`, `*.hf.co`, `raw.githubusercontent.com`. These are downloads only; no chat data is sent.
3. `api.telegram.org`, only after you connect your own bot.

Nothing else is possible: the browser enforces this list.

## Verify it yourself

1. DevTools → **Network**: open a chat and summarise; only the requests above appear.
2. Console: `fetch('https://example.com')` → *Refused to connect … violates the Content Security Policy*.
3. Turn Wi-Fi off after the model is cached: everything still works.

## Reporting

Please open a GitHub issue (no sensitive data) or contact the maintainer privately for anything security-related.

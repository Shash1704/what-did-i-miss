# Detection accuracy

Measured by the accuracy harness in [`app/src/eval/accuracy.test.ts`](app/src/eval/accuracy.test.ts).
Run it yourself with `cd app && npm run eval`. It also runs in CI on every push, and a deploy is blocked if it fails.

Each chat is labelled by hand: which messages are **mentions of you**, **tasks for you**, **decisions** and **deadlines**.
A detector's *precision* is the share of what it flagged that was correct, and *recall* is the share of the labelled items it found.

| Chat | Messages | Role |
|---|---|---|
| Demo chat | 80 | Development set. The rules were written against it |
| Held-out 1 | 25 | Written separately, with different phrasing and deliberate traps ("final exam was tough", "the deadline passed last week", "Shashwat's laptop is with me") |
| Held-out 2 | 12 | Hinglish group chat ("kal subah 9 baje tak", "pakka hai", "jaldi reply kar"), written before the Hinglish rules existed |

## Before tuning (unseen chats)

| Chat | Mentions | Your tasks | Decisions | Deadlines | Macro F1 |
|---|---|---|---|---|---|
| Held-out 1 | 100% | 100% | 100% | 71% recall | **96%** |
| Held-out 2 (Hinglish) | 100% | 100% | 50% recall | 33% recall | **79%** |

Precision was 100% everywhere: no false positives. The misses were implicit deadlines ("bring the cable **tomorrow morning**") and Hinglish ("aaj raat tak", "kal subah 9 baje tak", "pakka").

## After adding implicit deadlines and Hinglish normalisation

| Chat | Mentions | Your tasks | Decisions | Deadlines | Macro F1 |
|---|---|---|---|---|---|
| Demo chat | 100% | 100% | 100% | 100% | **100%** |
| Held-out 1 | 100% | 100% | 100% | 100% | **100%** |
| Held-out 2 (Hinglish) | 100% | 100% | 100% | 100% | **100%** |

**Caveat:** the "after" numbers come from the same chats that revealed the gaps, so they show the gaps were fixed without new false positives. They are not an unbiased estimate. The "before" numbers are the fairer guide to how the engine handles chats it has never seen. The test chats are also small and written by us, so real-world accuracy will be lower.

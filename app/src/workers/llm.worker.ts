// Runs the on-device LLM off the main thread so the UI never stutters while the model
// loads or generates. Messages from the page are handled by WebLLM's worker protocol.
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm'

const handler = new WebWorkerMLCEngineHandler()
self.addEventListener('message', (msg: MessageEvent) => handler.onmessage(msg))

import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Content Security Policy: the browser itself refuses any network connection except
 * downloading the open-source AI model (Hugging Face) and its WebGPU kernels (GitHub raw).
 * So even a bug — or a malicious dependency — cannot send a chat anywhere.
 */
function contentSecurityPolicy(dev: boolean): string {
  const modelHosts = 'https://huggingface.co https://*.huggingface.co https://*.hf.co https://raw.githubusercontent.com'
  return [
    "default-src 'self'",
    // 'wasm-unsafe-eval' lets the AI engine compile WebAssembly; Vite's dev server also needs inline scripts
    `script-src 'self' 'wasm-unsafe-eval'${dev ? " 'unsafe-inline'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${modelHosts}${dev ? ' ws: wss:' : ''}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ')
}

const csp = (): Plugin => ({
  name: 'content-security-policy',
  transformIndexHtml(html, ctx) {
    const meta = `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(!!ctx.server)}" />`
    return html.replace(/<head>/i, `<head>\n    ${meta}`)
  },
})

// Relative base so the static build works on GitHub Pages under /<repo>/
export default defineConfig({
  plugins: [react(), csp()],
  base: './',
})

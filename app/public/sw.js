// Offline shell + Web Share Target receiver.
// - Same-origin assets are cached so the app reloads with Wi-Fi off
//   (model weights are cached separately by WebLLM via the Cache API).
// - WhatsApp "Export chat" → share → this app POSTs the file to ./share-target.
//   We stash it in a local cache and redirect to the app. Nothing touches a server.
const CACHE = 'wdim-v3'
const SHARE_CACHE = 'wdim-share'

self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './index.html', './manifest.webmanifest']))) })
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

async function receiveShare(request) {
  const form = await request.formData()
  const file = form.get('chat')
  const text = form.get('text')
  const title = form.get('title')
  const cache = await caches.open(SHARE_CACHE)
  if (file && typeof file !== 'string') {
    await cache.put('shared', new Response(file, { headers: { 'x-name': encodeURIComponent(file.name || 'Shared chat'), 'content-type': file.type || 'application/octet-stream' } }))
  } else if (text) {
    await cache.put('shared', new Response(String(text), { headers: { 'x-name': encodeURIComponent(String(title || 'Shared chat')), 'content-type': 'text/plain' } }))
  }
  return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303)
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith(receiveShare(e.request))
    return
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  )
})

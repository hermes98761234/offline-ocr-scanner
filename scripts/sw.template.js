// Service worker, completed by vite.plugins.ts at build time (PRECACHE / VERSION are substituted).
// - The app shell is precached on install, so the scanner opens offline.
// - The tesseract worker/core and the pdf.js worker are cached the first time they are used.
// - Language data (traineddata) comes from the jsDelivr CDN once and is cached here
//   (and by tesseract.js itself in IndexedDB), so OCR keeps working offline afterwards.
const PRECACHE = __PRECACHE__
const VERSION = __VERSION__
const APP_CACHE = `ocr-app-${VERSION}`
const RUNTIME_CACHE = 'ocr-runtime-v1'
const MODEL_CACHE = 'ocr-models-v1'
const MODEL_HOSTS = ['cdn.jsdelivr.net', 'tessdata.projectnaptha.com']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((p) => new URL(p, self.registration.scope).href)))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ocr-app-') && k !== APP_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function cacheFirst(request, cacheName, fallbackUrl) {
  const cached = await caches.match(request, { ignoreSearch: request.mode === 'navigate' })
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response.ok) {
      const copy = response.clone()
      caches.open(cacheName).then((c) => c.put(request, copy))
    }
    return response
  } catch (err) {
    if (fallbackUrl) {
      const fallback = await caches.match(new URL(fallbackUrl, self.registration.scope).href)
      if (fallback) return fallback
    }
    throw err
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin === self.location.origin) {
    if (!url.href.startsWith(self.registration.scope)) return
    event.respondWith(cacheFirst(request, RUNTIME_CACHE, request.mode === 'navigate' ? './' : undefined))
  } else if (MODEL_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, MODEL_CACHE))
  }
})

/* Service worker for GitHub Pages: app shell cache and offline fallback. */
const CACHE_PREFIX = "fleet-incidents-pwa-";
const CACHE_NAME = CACHE_PREFIX + "v2";
const APP_BASE = self.registration.scope;
const SHELL_URLS = [
  new URL("./index.html", APP_BASE).href,
  new URL("./manifest.webmanifest", APP_BASE).href,
  new URL("./icons/app-192.png", APP_BASE).href,
  new URL("./icons/app-512.png", APP_BASE).href
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(new URL("./index.html", APP_BASE).href, copy));
        }
        return response;
      }).catch(async () => {
        const exact = await caches.match(request);
        if (exact) return exact;
        const shell = await caches.match(new URL("./index.html", APP_BASE).href);
        return shell || Response.error();
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});

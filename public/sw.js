/* AI DOMEgod service worker
 * - Pages and /api: network first. /api/chat responses are never written to the cache.
 * - Static assets (js/css/png/manifest): stale-while-revalidate.
 * - POST and cross-origin requests are left to the network.
 * Bump VERSION when static files change.
 */
const VERSION = "domegod-v1";
const STATIC_CACHE = VERSION + "-static";
const SHELL = "/";
const PRECACHE = [
  "/",
  "/styles.css",
  "/app.js",
  "/markdown.js",
  "/pwa.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/favicon-32.png",
];
const NEVER_CACHE = [/^\/api\//, /^\/healthz$/, /^\/sw\.js$/];
const STATIC_RE = /\.(?:js|css|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|webmanifest)$/i;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("domegod-") && k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cacheable(res) {
  if (!res || res.status !== 200 || res.type !== "basic") return false;
  const cc = res.headers.get("Cache-Control") || "";
  return !/no-store|private/i.test(cc) && !res.headers.has("Set-Cookie");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // /api (including /api/chat) and health: network only, never cache.
  if (NEVER_CACHE.some((re) => re.test(url.pathname))) {
    event.respondWith(fetch(req));
    return;
  }

  // Pages: network first, fall back to the cached shell when offline.
  if (req.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith(".html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (cacheable(res) && (url.pathname === "/" || req.mode === "navigate")) {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(SHELL, copy));
          }
          return res;
        })
        .catch(() => caches.match(SHELL).then((r) => r || Response.error()))
    );
    return;
  }

  // Static assets: serve from cache, refresh in the background.
  if (STATIC_RE.test(url.pathname) && !url.search) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(req).then((hit) => {
          const net = fetch(req)
            .then((res) => { if (cacheable(res)) cache.put(req, res.clone()); return res; })
            .catch(() => hit || Response.error());
          if (hit) {
            event.waitUntil(net.catch(() => {}));
            return hit;
          }
          return net;
        })
      )
    );
  }
});

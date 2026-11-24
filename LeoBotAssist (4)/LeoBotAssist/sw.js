const CACHE = "leobotassist-v4";
const FILES = [
  "./", "index.html", "style.css", "app.js", "manifest.json",
  "icon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Show the saved copy instantly, but refresh it in the background so friends always get updates.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/.netlify/")) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(e.request);
      const fresh = fetch(e.request)
        .then((res) => { if (res && res.ok) cache.put(e.request, res.clone()); return res; })
        .catch(() => hit);
      return hit || fresh;
    })
  );
});

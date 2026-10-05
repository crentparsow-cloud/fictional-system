// Offline shell only. Reader data is never cached: it lives on the server.
const CACHE = "shell-v4";
const SHELL = ["/", "/supabase.js", "/locale.js", "/webauthn.js", "/manifest.webmanifest", "/icon.svg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return; // never touch API calls
  if (u.pathname.startsWith("/go/") || u.pathname.startsWith("/api/")) return; // book links and locale always go to the network
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match("/"))));
});

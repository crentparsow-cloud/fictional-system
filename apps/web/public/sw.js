/*
 * Akana service worker (F-140). An allowlist, not a cache of the app.
 *
 * It keeps exactly two files: the offline Help now page and its stylesheet.
 * Nothing a reader writes, no workbook, no page that needs a sign-in and no
 * API response is ever stored. Every other request goes to the network
 * untouched. When a page cannot load at all (no network, or the app is
 * down), the reader gets the offline Help now page instead of an error, so
 * the crisis numbers are always one tap away.
 *
 * Auth callbacks, /go/, /api/, previews, token links, sign-in and admin are
 * network only: never cached and never answered from a cache. The one
 * exception is a page navigation that cannot reach the network at all,
 * which still gets the offline Help now page, because a reader who is
 * offline on the sign-in page needs the numbers as much as anyone.
 *
 * The list below is checked by apps/web/lib/sw.test.ts. Change both together.
 */
const VERSION = "help-v1";
const CACHE = "akana-" + VERSION;
const PRECACHE = ["/help-offline", "/help-offline.css"];
const NETWORK_ONLY = ["/auth/", "/go/", "/api/", "/preview", "/respond/", "/admin", "/sign-in", "/sign-out"];
const FALLBACK = "/help-offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload", credentials: "omit" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page may ask for the cache to be cleared, for example at sign-out.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "akana:clear") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const networkOnly = NETWORK_ONLY.some((p) => url.pathname === p || url.pathname.startsWith(p));

  // The two allowlisted files: network first so a new deploy wins, the copy when offline.
  if (!networkOnly && PRECACHE.includes(url.pathname) && url.search === "") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(() => caches.match(url.pathname).then((hit) => hit || Response.error())),
    );
    return;
  }

  // Any page, network-only ones included: the network, never a cache. If the
  // network cannot be reached at all, Help now. A response that arrives, even
  // an error page or a redirect, is passed through untouched.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(FALLBACK).then((hit) => hit || Response.error())));
  }
});

/*
 * Daily step notification (13.19). A push arrives with no body at all, so
 * nothing about the reader or a workbook ever passes through a push service.
 * The words are fixed here, the same for everyone. Tapping the notification
 * opens Today, straight to the step. The badge (14.7) is set to 1 here as well,
 * and Today clears it once a step is done. Nothing is cached by any of this.
 */
const PUSH_TITLE = "Akana";
const PUSH_BODY = "Your step for today is ready.";
const PUSH_URL = "/today/go";

self.addEventListener("push", (event) => {
  const show = self.registration.showNotification(PUSH_TITLE, {
    body: PUSH_BODY,
    tag: "daily-step",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: PUSH_URL },
  });
  const badge = self.navigator && typeof self.navigator.setAppBadge === "function" ? self.navigator.setAppBadge(1).catch(() => undefined) : Promise.resolve();
  event.waitUntil(Promise.all([show, badge]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(PUSH_URL, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (open && typeof open.navigate === "function") return open.navigate(target).then((w) => (w || open).focus());
      return self.clients.openWindow(target);
    }),
  );
});

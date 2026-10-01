// Compass service worker: keeps a copy of the app so it opens without a connection,
// and shows check-in reminders.
// Pages and settings are network-first (online you always get the latest version; the copy is only
// a fallback). The bundled SDK and icons are versioned, so they come from the copy once saved.
const SHELL = "compass-shell-v1";
const PRECACHE = ["/", "/vendor/firebase.js?v=3", "/firebase-config.js", "/import.js", "/manifest.webmanifest", "/icons/icon-192.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => Promise.all(PRECACHE.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("compass-") && k !== SHELL) await caches.delete(k);
  await self.clients.claim();
})()));

const cacheFirst = /^\/(vendor|icons)\//;
async function fromNetwork(req, key) {
  const res = await fetch(req);
  if (res && res.ok && res.type === "basic") { const c = await caches.open(SHELL); await c.put(key, res.clone()); }
  return res;
}
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;   // Google sign-in, Firestore etc. go straight through
  if (url.pathname === "/sw.js" || url.pathname === "/ms-auth.html") return;      // never served from the copy
  const app = url.pathname === "/" || url.pathname === "/index.html";
  const key = app ? "/" : url.pathname + url.search;
  if (cacheFirst.test(url.pathname)) {
    e.respondWith(caches.match(key).then(hit => hit || fromNetwork(req, key)));
    return;
  }
  e.respondWith((async () => {
    const net = fromNetwork(req, key);
    if (!app) return net.catch(async () => (await caches.match(key)) || Response.error());
    // the app page: wait up to 4 s for the network on a weak connection, then open the saved copy
    const saved = await caches.match(key);
    if (!saved) return net;
    return Promise.race([net.catch(() => saved), new Promise(r => setTimeout(() => r(saved), 4000))]);
  })());
});

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: "Compass", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Compass", {
    body: d.body || "",
    tag: d.tag || "compass",
    renotify: false,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: d.url || "/" },
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin) { await c.focus(); c.postMessage({ type: "open", url }); return; }
    }
    await self.clients.openWindow(url);
  })());
});

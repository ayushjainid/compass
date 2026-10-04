// Compass service worker: keeps a copy of the app so it opens without a connection,
// and shows check-in reminders.
// Pages and settings are network-first (online you always get the latest version; the copy is only
// a fallback). The bundled SDK and icons are versioned, so they come from the copy once saved.
const SHELL = "compass-shell-v4";
/* the reminders Worker's address (self.COMPASS_WORKER_URL), for the buttons on reminders */
try { importScripts("/firebase-config.js"); } catch (e) {}
const PRECACHE = ["/", "/vendor/firebase.js?v=5", "/firebase-config.js", "/import.js", "/shared/values.js", "/shared/ics.js", "/manifest.webmanifest", "/icons/icon-192.png"];
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
  const canAct = !!(self.COMPASS_WORKER_URL && d.act && Array.isArray(d.actions));
  e.waitUntil(self.registration.showNotification(d.title || "Compass", {
    body: d.body || "",
    tag: d.tag || "compass",
    renotify: false,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    actions: canAct ? d.actions.slice(0, 2) : [],
    data: { url: d.url || "/", act: canAct ? d.act : null },
  }));
});

/* a button on a reminder: ask the Worker to tick that floor (or snooze), then say how it went */
async function runAction(n, action) {
  const data = n.data || {}, token = data.act && data.act[action], base = String(self.COMPASS_WORKER_URL || "").replace(/\/$/, "");
  if (!token || !base) return false;
  let msg = "", ok = false;
  try {
    const r = await fetch(base + "/act", { method: "POST", body: JSON.stringify({ t: token }) });
    const j = await r.json().catch(() => ({}));
    ok = r.ok && j.ok; msg = j.msg || "";
  } catch (err) { ok = false; }
  if (!ok) return false;
  const left = Object.keys(data.act).filter(k => k !== action && k.startsWith("tick"));
  const actions = action.startsWith("tick") ? (n.actions || []).filter(a => a.action !== action && left.includes(a.action)) : [];
  await self.registration.showNotification(left.length && actions.length ? n.title : "Compass", {
    body: msg || "Done.", tag: n.tag || "compass", renotify: false, silent: true, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png",
    actions, data: { url: data.url || "/", act: actions.length ? Object.fromEntries(left.map(k => [k, data.act[k]])) : null },
  });
  /* a plain confirmation tidies itself away (waited for here, so the browser keeps the worker alive until then) */
  if (!actions.length) { await new Promise(r => setTimeout(r, 4000)); const ns = await self.registration.getNotifications({ tag: n.tag || "compass" }); ns.forEach(x => x.close()); }
  return true;
}
self.addEventListener("notificationclick", e => {
  if (e.action) {
    const n = e.notification; n.close();
    e.waitUntil(runAction(n, e.action).then(done => done ? null : openApp((n.data && n.data.url) || "/")));
    return;
  }
  e.notification.close();
  e.waitUntil(openApp((e.notification.data && e.notification.data.url) || "/"));
});
async function openApp(path) {
  const url = new URL(path, self.location.origin).href;
  const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const c of all) {
    if (new URL(c.url).origin === self.location.origin) { await c.focus(); c.postMessage({ type: "open", url }); return; }
  }
  await self.clients.openWindow(url);
}

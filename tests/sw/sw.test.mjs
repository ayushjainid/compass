// The service worker's reminder buttons, run against a stand-in for the browser's service-worker world.
import { readFileSync } from "node:fs";
import vm from "node:vm";
const R = []; const ok = (n, c, i) => R.push([n, !!c, i]);
const src = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

function makeSW({ worker = "https://w.test", fetchImpl } = {}) {
  const handlers = {}, shown = [], opened = [], posted = [], closed = [];
  const self = {
    addEventListener: (t, f) => (handlers[t] = f),
    location: { origin: "https://life-compass.web.app" },
    registration: {
      showNotification: async (title, o) => { shown.push({ title, ...o }); },
      getNotifications: async ({ tag }) => shown.filter(n => n.tag === tag).map(n => ({ close: () => closed.push(n) })),
    },
    clients: { matchAll: async () => [], openWindow: async u => { opened.push(u); } },
    skipWaiting() {},
  };
  const ctx = { self, importScripts: () => { self.COMPASS_WORKER_URL = worker; }, fetch: async (u, init) => { posted.push({ u, body: JSON.parse(init.body) }); return fetchImpl(u, init); },
    caches: {}, URL, setTimeout: (f) => f(), console, Response, Request, Promise, JSON, Object, Array, String };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const fire = async (type, ev) => { let p; ev.waitUntil = x => (p = x); handlers[type](ev); await p; };
  return { self, handlers, shown, opened, posted, closed, fire };
}
const ok200 = msg => async () => new Response(JSON.stringify({ ok: true, msg }), { status: 200 });
const pushEvent = d => ({ data: { json: () => d, text: () => JSON.stringify(d) } });
const payload = { title: "Quick one", body: "2 left today: Gym and Read.", tag: "compass-checkin", url: "/?from=checkin",
  actions: [{ action: "tick0", title: "✓ Gym" }, { action: "tick1", title: "✓ Read" }], act: { tick0: "T0", tick1: "T1" } };

// showing
let sw = makeSW({ fetchImpl: ok200("Gym ✓ Logged for today.") });
await sw.fire("push", pushEvent(payload));
ok("shows both buttons and keeps the tokens with it", sw.shown[0].actions.length === 2 && sw.shown[0].data.act.tick0 === "T0", sw.shown[0]);
const noWorker = makeSW({ worker: "", fetchImpl: ok200("") });
await noWorker.fire("push", pushEvent(payload));
ok("no Worker address configured: no buttons", noWorker.shown[0].actions.length === 0 && noWorker.shown[0].data.act === null);
const plain = makeSW({ fetchImpl: ok200("") });
await plain.fire("push", pushEvent({ title: "Sunday review o'clock", body: "x", tag: "compass-review", url: "/?tab=review" }));
ok("reminders without buttons still show", plain.shown[0].title === "Sunday review o'clock" && plain.shown[0].actions.length === 0);

// tapping a tick button
const note = Object.assign({}, sw.shown[0], { close() {} });
await sw.fire("notificationclick", { action: "tick0", notification: note });
ok("tick: posts its token to the Worker", sw.posted[0].u === "https://w.test/act" && sw.posted[0].body.t === "T0", sw.posted);
const after = sw.shown[1];
ok("…then shows the result with only the other button left", after.body === "Gym ✓ Logged for today." && after.actions.length === 1 && after.actions[0].action === "tick1" && after.data.act.tick1 === "T1" && !after.data.act.tick0, after);
ok("…quietly (no second buzz)", after.silent === true && after.tag === "compass-checkin");
ok("…and doesn't open the app", sw.opened.length === 0);
// last button: a plain confirmation that tidies itself away
await sw.fire("notificationclick", { action: "tick1", notification: Object.assign({}, after, { close() {} }) });
const last = sw.shown[2];
ok("last tick: confirmation without buttons, closed after a moment", last.actions.length === 0 && sw.closed.length >= 1, last);

// snooze
const sn = makeSW({ fetchImpl: ok200("OK, I'll nudge you again in an hour.") });
await sn.fire("notificationclick", { action: "snooze", notification: { title: "Quick one", tag: "compass-checkin", data: { url: "/", act: { snooze: "S" } }, actions: [{ action: "snooze", title: "Remind me in an hour" }], close() {} } });
ok("snooze: posts and confirms", sn.posted[0].body.t === "S" && /an hour/.test(sn.shown[0].body));

// failure: offline or refused → open the app instead
const off = makeSW({ fetchImpl: async () => { throw new Error("offline"); } });
await off.fire("notificationclick", { action: "tick0", notification: Object.assign({}, payload, { data: { url: "/?from=checkin", act: payload.act }, close() {} }) });
ok("offline: opens Compass instead", off.opened[0] === "https://life-compass.web.app/?from=checkin" && off.shown.length === 0, off.opened);
const refused = makeSW({ fetchImpl: async () => new Response(JSON.stringify({ ok: false }), { status: 403 }) });
await refused.fire("notificationclick", { action: "tick0", notification: Object.assign({}, payload, { data: { url: "/", act: payload.act }, close() {} }) });
ok("expired button: opens Compass instead", refused.opened.length === 1 && refused.shown.length === 0);
// tapping the body still opens the app
const body = makeSW({ fetchImpl: ok200("") });
await body.fire("notificationclick", { action: "", notification: { data: { url: "/?tab=review" }, close() {} } });
ok("tapping the reminder itself opens the right tab", body.opened[0] === "https://life-compass.web.app/?tab=review");

const f = R.filter(x => !x[1]); f.forEach(x => console.log("  FAIL", x[0], JSON.stringify(x[2] ?? "").slice(0, 400)));
console.log(`service worker: ${R.length - f.length}/${R.length} passed`); process.exit(f.length ? 1 : 0);

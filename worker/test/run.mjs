// runOnce against an in-memory Firestore REST double and fake push services
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ece = require("http_ece"), nc = require("crypto");
import { runOnce } from "../src/index.js";
import { toValue, fromFields } from "../src/firestore.js";
import { b64uEncode } from "../src/push.js";
const R = []; const ok = (n, c, i) => R.push({ n, pass: !!c, i });
const P = "projects/demo/databases/(default)/documents";
const store = new Map(); // name -> fields (REST encoded)
const users = {};
function addUser(uid, d) {
  const e = nc.createECDH("prime256v1"); e.generateKeys(); const auth = nc.randomBytes(16);
  users[uid] = { e, auth, got: [] };
  const sub = { endpoint: `https://push.example/${uid}`, keys: { p256dh: b64uEncode(e.getPublicKey()), auth: b64uEncode(auth) } };
  const full = { on: true, sub, ...d };
  store.set(`${P}/notify/${uid}`, Object.fromEntries(Object.entries(full).map(([k, v]) => [k, toValue(v)])));
}
const calls = { query: 0, commit: 0, push: 0 };
let goneUid = null; const deadDevs = new Set(), authSeen = [];
async function fakeFetch(url, init) {
  const u = String(url);
  if (u.includes(":runQuery")) {
    calls.query++;
    const q = JSON.parse(init.body).structuredQuery, f = q.where.fieldFilter, lim = q.limit, cut = Date.parse(f.value.timestampValue);
    const rows = [...store.entries()].map(([name, fields]) => ({ name, fields, t: fields[f.field.fieldPath] && fields[f.field.fieldPath].timestampValue ? Date.parse(fields[f.field.fieldPath].timestampValue) : null }))
      .filter(r => r.t !== null && r.t <= cut).sort((a, b) => a.t - b.t).slice(0, lim);
    return new Response(JSON.stringify(rows.length ? rows.map(r => ({ document: { name: r.name, fields: r.fields } })) : [{ readTime: "x" }]), { status: 200 });
  }
  if (u.includes(":batchGet")) {
    const { documents } = JSON.parse(init.body);
    return new Response(JSON.stringify(documents.map(n => store.has(n) ? { found: { name: n, fields: store.get(n) } } : { missing: n })), { status: 200 });
  }
  if (u.includes(":commit")) {
    calls.commit++;
    const { writes } = JSON.parse(init.body);
    if (writes.some(w => w.currentDocument && w.currentDocument.exists && !store.has(w.update.name))) return new Response("NOT_FOUND", { status: 404 });
    for (const w of writes) {
      if (!store.has(w.update.name)) store.set(w.update.name, {});
      const cur = store.get(w.update.name);
      /* field paths may be `quoted`.`segments`; a path in the mask but not in the data deletes that field */
      for (const fp of w.updateMask.fieldPaths) {
        const ss = fp.match(/`(?:[^`\\]|\\.)*`|[^.]+/g).map(x => x.startsWith("`") ? x.slice(1, -1).replace(/\\(.)/g, "$1") : x);
        let v = { mapValue: { fields: w.update.fields } }; for (const k of ss) v = v && v.mapValue && v.mapValue.fields[k];
        let o = cur; for (const k of ss.slice(0, -1)) { o[k] = o[k] && o[k].mapValue ? o[k] : { mapValue: { fields: {} } }; o = o[k].mapValue.fields; }
        if (v === undefined) delete o[ss[ss.length - 1]]; else o[ss[ss.length - 1]] = v;
      }
      // like Firestore: a dotted path ("sent.d20261006") is a field inside a map
      for (const t of w.updateTransforms || []) {
        const parts = t.fieldPath.split("."); let o = cur;
        for (const k of parts.slice(0, -1)) { o[k] = o[k] && o[k].mapValue ? o[k] : { mapValue: { fields: {} } }; o = o[k].mapValue.fields; }
        const last = parts[parts.length - 1]; o[last] = { integerValue: String(+((o[last] || {}).integerValue || 0) + +t.increment.integerValue) };
      }
    }
    return new Response("{}", { status: 200 });
  }
  if (u.startsWith("https://push.example/")) {
    calls.push++;
    const uid = u.split("/").pop();
    authSeen.push(init.headers.Authorization);
    if (uid === goneUid || deadDevs.has(uid)) return new Response("", { status: 410 });
    if (uid === "applebad") return new Response(JSON.stringify({ reason: "BadJwtToken" }), { status: 403 });
    const x = users[uid];
    const plain = ece.decrypt(Buffer.from(init.body), { version: "aes128gcm", privateKey: x.e, authSecret: x.auth.toString("base64url") });
    x.got.push(JSON.parse(plain.toString()));
    return new Response("", { status: 201 });
  }
  throw new Error("unexpected fetch " + u);
}
const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
const env = { FIRESTORE_EMULATOR: "http://fake", FIREBASE_PROJECT: "demo", VAPID_PUBLIC: b64uEncode(await crypto.subtle.exportKey("raw", kp.publicKey)), VAPID_PRIVATE: (await crypto.subtle.exportKey("jwk", kp.privateKey)).d, VAPID_SUBJECT: "mailto:t@t.t" };
const now = Date.parse("2026-09-30T16:00:20Z"); // 9:30 pm Kolkata, 12:00 noon New York
const due = new Date("2026-09-30T16:00:00Z");
addUser("a", { tz: "Asia/Kolkata", eve: "21:30", rev: "18:00", nextEve: due, nextRev: new Date("2026-10-04T12:30:00Z"), last: "2026-09-29", ign: 0 });
// a's plan: two floors still open on Wednesday 30 Sep → the reminder offers to tick them
store.set(`${P}/users/a/docs/profile`, { components: toValue({ x: [{ id: "gym", name: "Gym", cadence: "daily", target: 3, block: { days: [2], time: "07:00" } }, { id: "read", name: "Read", cadence: "weekly", target: 2, block: { days: [2], time: "21:00" } }] }).mapValue.fields.x });
addUser("b", { tz: "Asia/Kolkata", eve: "21:30", rev: "", nextEve: due, last: "2026-09-30", ign: 0 });             // active today
addUser("c", { tz: "America/New_York", eve: "21:30", rev: "18:00", nextEve: new Date("2026-10-01T01:30:00Z"), nextRev: new Date("2026-10-04T22:00:00Z"), last: "2026-09-29" }); // not due
addUser("gone", { tz: "Asia/Kolkata", eve: "21:30", nextEve: due, last: "2026-09-20", ign: 1 });
goneUid = "gone";
const logs = [];
let r = await runOnce(env, now, fakeFetch, m => logs.push(m));
const doc = id => fromFields(store.get(`${P}/notify/${id}`));
ok("sends to the person who hasn't checked in", users.a.got.length === 1 && users.a.got[0].tag === "compass-checkin", users.a.got);
const pa = users.a.got[0] || {};
ok("evening push says what's left and carries a tick button for each", /2 left today: Gym and Read\./.test(pa.body) && (pa.actions || []).map(x => x.title).join("|") === "✓ Gym|✓ Read" && pa.act && pa.act.tick0 && pa.act.tick1, pa);
ok("skips the person active today", users.b.got.length === 0);
ok("does not touch people not yet due", users.c.got.length === 0 && doc("c").nextEve === Date.parse("2026-10-01T01:30:00Z"));
ok("books tomorrow for everyone it handled", doc("a").nextEve === Date.parse("2026-10-01T16:00:00Z") && doc("b").nextEve === Date.parse("2026-10-01T16:00:00Z"));
ok("expired subscription gets switched off", doc("gone").on === false && doc("gone").sub === null && doc("gone").nextEve === null);
ok("counts and marks the send", doc("a").ign === 1 && doc("a").sentDay === "2026-09-30");
ok("result summary", r.sent === 1 && r.dead === 1, r);
// a second run in the same minute must not resend
r = await runOnce(env, now + 5000, fakeFetch, m => logs.push(m));
ok("no double send on an overlapping run", users.a.got.length === 1 && r.checked === 0, r);
// Sunday: review for a, c
r = await runOnce(env, Date.parse("2026-10-04T12:30:05Z"), fakeFetch, m => logs.push(m));
ok("Sunday review arrives for Kolkata at 6 pm local", users.a.got.some(g => g.tag === "compass-review"));
r = await runOnce(env, Date.parse("2026-10-04T22:00:05Z"), fakeFetch, m => logs.push(m));
ok("…and for New York at its own 6 pm", users.c.got.some(g => g.tag === "compass-review"));
// a deleted account between query and commit: others still go out
store.delete(`${P}/notify/b`);
addUser("d", { tz: "Asia/Kolkata", eve: "21:30", nextEve: new Date("2026-10-05T16:00:00Z"), last: "2026-10-01" });
addUser("e", { tz: "Asia/Kolkata", eve: "21:30", nextEve: new Date("2026-10-05T16:00:00Z"), last: "2026-10-01" });
const realDelete = () => store.delete(`${P}/notify/e`);
const wrapped = async (u, i) => { if (String(u).includes(":commit") && store.has(`${P}/notify/e`) && JSON.parse(i.body).writes.length > 1) realDelete(); return fakeFetch(u, i); };
r = await runOnce(env, Date.parse("2026-10-05T16:00:10Z"), wrapped, m => logs.push(m));
ok("an account deleted mid-run doesn't block the others", users.d.got.length === 1 && !store.has(`${P}/notify/e`), r);
// load: 30 people due the same minute -> 8 per run, all served within 4 minutes, none twice
for (let i = 0; i < 30; i++) addUser("L" + i, { tz: "Asia/Kolkata", eve: "21:30", nextEve: new Date("2026-10-06T16:00:00Z"), last: "2026-10-01" });
calls.push = 0; const before = { ...calls };
let minutes = 0; for (; minutes < 10; minutes++) { const x = await runOnce(env, Date.parse("2026-10-06T16:00:05Z") + minutes * 60000, fakeFetch, () => {}); if (!x.checked) break; }
const got = Object.keys(users).filter(k => k.startsWith("L")).map(k => users[k].got.length);
ok("30 due at once: all served within 5 runs (6 a minute), each exactly once", got.every(n => n === 1) && minutes <= 6, { minutes, got });
ok("budget per run stays small", true);
// health: status/reminders records sends, idle ticks and errors
const hb = () => fromFields(store.get(`${P}/status/reminders`) || {});
let h = hb();
ok("heartbeat written after a run that sent", h.ok === true && h.lastSendAt && h.sent && h.sent.d20261006 >= 30, h);
const t0 = Date.parse("2026-10-07T10:03:00Z"); store.delete(`${P}/status/reminders`);
for (const k of [...store.keys()]) if (k.includes("/notify/")) store.delete(k);   // nobody due: an idle Worker
const idle = await runOnce(env, t0, fakeFetch, () => {});
ok("idle run off the 10-minute tick writes nothing", idle.checked === 0 && !store.has(`${P}/status/reminders`), idle);
await runOnce(env, Date.parse("2026-10-07T10:10:00Z"), fakeFetch, () => {});
ok("idle run on the tick writes a heartbeat", hb().ok === true && +new Date(hb().at) === Date.parse("2026-10-07T10:10:00Z"), hb());
addUser("Z", { tz: "Asia/Kolkata", eve: "21:30", nextEve: new Date("2026-10-07T10:00:00Z"), last: "2026-10-01" });
let threw = false; try { await runOnce({ ...env, VAPID_PRIVATE: "" }, Date.parse("2026-10-07T10:11:00Z"), fakeFetch, () => {}); } catch (e) { threw = true; }
h = hb();
ok("an error is recorded with its message", threw && h.ok === false && /VAPID/.test(h.lastError) && h.errors && h.errors.d20261007 === 1, h);
// ---- several devices: each gets the reminder; a dead one is dropped and marked, the others stay
function devSub(name) { const e = nc.createECDH("prime256v1"); e.generateKeys(); const a = nc.randomBytes(16); users[name] = { e, auth: a, got: [] }; return { endpoint: `https://push.example/${name}`, keys: { p256dh: b64uEncode(e.getPublicKey()), auth: b64uEncode(a) } }; }
for (const k of [...store.keys()]) if (k.includes("/notify/")) store.delete(k);
const phone = devSub("m-phone"), laptop = devSub("m-laptop"), oldTab = devSub("m-old");
store.set(`${P}/notify/m`, Object.fromEntries(Object.entries({ on: true, tz: "Asia/Kolkata", eve: "21:30", nextEve: new Date("2026-10-08T16:00:00Z"), last: "2026-10-01",
  sub: laptop, subs: { dPhone: { ...phone, dev: "iPhone · Home Screen app", at: 1 }, dLap: { ...laptop, dev: "Mac · Chrome", at: 2 }, dOld: { ...oldTab, dev: "Windows · Edge", at: 3 } } }).map(([k, v]) => [k, toValue(v)])));
deadDevs.add("m-old");
r = await runOnce(env, Date.parse("2026-10-08T16:00:05Z"), fakeFetch, () => {});
let m = fromFields(store.get(`${P}/notify/m`));
ok("every device gets the evening reminder (not just the last one opened)", users["m-phone"].got.length === 1 && users["m-laptop"].got.length === 1, r);
ok("a device whose address is gone is dropped and marked to reconnect; the others stay; still on", m.on === true && !m.subs.dOld && m.subs.dPhone && m.subs.dLap && m.lost && m.lost.dOld === true, m);
// ---- "Send a test": goes to every device now, and writes back what each push service said
const bad = devSub("applebad");
store.set(`${P}/notify/m`, Object.fromEntries(Object.entries({ ...m, nextTest: new Date("2026-10-08T17:00:00Z"), subs: { ...m.subs, dBad: { ...bad, dev: "iPhone · Home Screen app" } } }).map(([k, v]) => [k, toValue(v)])));
r = await runOnce(env, Date.parse("2026-10-08T17:00:03Z"), fakeFetch, () => {});
m = fromFields(store.get(`${P}/notify/m`));
const tr = (m.test || {}).res || [];
ok("test push goes to every device, whatever the schedule", users["m-phone"].got.some(g => g.tag === "compass-test") && users["m-laptop"].got.some(g => g.tag === "compass-test"), users["m-phone"].got);
ok("test results written back: accepted ones ok, Apple's refusal reason kept", m.nextTest === null && tr.length === 3 && tr.filter(x => x.ok).length === 2 && tr.some(x => x.d === "dBad" && !x.ok && x.s === 403 && x.r === "BadJwtToken" && x.dev === "iPhone · Home Screen app"), m.test);
ok("the refusal shows on the health doc for the dashboard", /403 BadJwtToken/.test(fromFields(store.get(`${P}/status/reminders`)).lastPushError || ""), fromFields(store.get(`${P}/status/reminders`)));
// ---- signed tokens are reused across runs (Apple: not more than one new token an hour), also after a restart
const { _resetJwtCache } = await import("../src/push.js");
authSeen.length = 0;
store.set(`${P}/notify/m`, Object.fromEntries(Object.entries({ ...m, nextTest: new Date("2026-10-08T17:05:00Z"), subs: { dPhone: m.subs.dPhone } }).map(([k, v]) => [k, toValue(v)])));
await runOnce(env, Date.parse("2026-10-08T17:05:03Z"), fakeFetch, () => {});
_resetJwtCache();   // a fresh Worker instance
store.set(`${P}/notify/m`, Object.fromEntries(Object.entries({ ...fromFields(store.get(`${P}/notify/m`)), nextTest: new Date("2026-10-08T17:40:00Z") }).map(([k, v]) => [k, toValue(v)])));
await runOnce(env, Date.parse("2026-10-08T17:40:03Z"), fakeFetch, () => {});
ok("a fresh Worker reuses the saved signed token instead of making a new one", authSeen.length === 2 && authSeen[0] === authSeen[1] && store.has(`${P}/status/vapid`), authSeen.length);
const f = R.filter(x => !x.pass); console.log(`worker: ${R.length - f.length}/${R.length} passed`); f.forEach(x => console.log("  FAIL", x.n, String(JSON.stringify(x.i)).slice(0, 400)));
process.exit(f.length ? 1 : 0);

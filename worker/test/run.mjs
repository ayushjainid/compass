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
let goneUid = null;
async function fakeFetch(url, init) {
  const u = String(url);
  if (u.includes(":runQuery")) {
    calls.query++;
    const q = JSON.parse(init.body).structuredQuery, f = q.where.fieldFilter, lim = q.limit, cut = Date.parse(f.value.timestampValue);
    const rows = [...store.entries()].map(([name, fields]) => ({ name, fields, t: fields[f.field.fieldPath] && fields[f.field.fieldPath].timestampValue ? Date.parse(fields[f.field.fieldPath].timestampValue) : null }))
      .filter(r => r.t !== null && r.t <= cut).sort((a, b) => a.t - b.t).slice(0, lim);
    return new Response(JSON.stringify(rows.length ? rows.map(r => ({ document: { name: r.name, fields: r.fields } })) : [{ readTime: "x" }]), { status: 200 });
  }
  if (u.includes(":commit")) {
    calls.commit++;
    const { writes } = JSON.parse(init.body);
    if (writes.some(w => !store.has(w.update.name))) return new Response("NOT_FOUND", { status: 404 });
    for (const w of writes) { const cur = store.get(w.update.name); for (const k of w.updateMask.fieldPaths) cur[k] = w.update.fields[k]; }
    return new Response("{}", { status: 200 });
  }
  if (u.startsWith("https://push.example/")) {
    calls.push++;
    const uid = u.split("/").pop();
    if (uid === goneUid) return new Response("", { status: 410 });
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
addUser("b", { tz: "Asia/Kolkata", eve: "21:30", rev: "", nextEve: due, last: "2026-09-30", ign: 0 });             // active today
addUser("c", { tz: "America/New_York", eve: "21:30", rev: "18:00", nextEve: new Date("2026-10-01T01:30:00Z"), nextRev: new Date("2026-10-04T22:00:00Z"), last: "2026-09-29" }); // not due
addUser("gone", { tz: "Asia/Kolkata", eve: "21:30", nextEve: due, last: "2026-09-20", ign: 1 });
goneUid = "gone";
const logs = [];
let r = await runOnce(env, now, fakeFetch, m => logs.push(m));
const doc = id => fromFields(store.get(`${P}/notify/${id}`));
ok("sends to the person who hasn't checked in", users.a.got.length === 1 && users.a.got[0].tag === "compass-checkin", users.a.got);
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
const f = R.filter(x => !x.pass); console.log(`worker: ${R.length - f.length}/${R.length} passed`); f.forEach(x => console.log("  FAIL", x.n, JSON.stringify(x.i).slice(0, 400)));

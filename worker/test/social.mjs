// Notes between people: pings (join, task, cheer) and the Sunday note to watchers, end to end through runOnce
// against an in-memory Firestore and fake push services that decrypt what they get.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ece = require("http_ece"), nc = require("crypto");
import { runOnce } from "../src/index.js";
import { pingText, digestText, quietUntil, nextDigest } from "../src/social.js";
import { toValue, fromFields } from "../src/firestore.js";
import { b64uEncode } from "../src/push.js";
const R = []; const ok = (n, c, i) => R.push({ n, pass: !!c, i });
const P = "projects/demo/databases/(default)/documents";
const store = new Map(), devs = {}, dead = new Set();
const enc = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, toValue(v)]));
const put = (path, o) => store.set(`${P}/${path}`, enc(o));
const get = path => { const f = store.get(`${P}/${path}`); return f ? fromFields(f) : null; };
function device(name) { const e = nc.createECDH("prime256v1"); e.generateKeys(); const a = nc.randomBytes(16); devs[name] = { e, auth: a, got: [] }; return { endpoint: `https://push.example/${name}`, keys: { p256dh: b64uEncode(e.getPublicKey()), auth: b64uEncode(a) }, dev: name }; }
const got = name => devs[name].got;
let failCommitOnce = false;
async function fakeFetch(url, init) {
  const u = String(url);
  if (u.includes(":runQuery")) {
    const q = JSON.parse(init.body).structuredQuery, f = q.where.fieldFilter, col = q.from[0].collectionId, cut = Date.parse(f.value.timestampValue);
    const rows = [...store.entries()].filter(([name]) => name.split("/").slice(-2, -1)[0] === col && name.split("/").length === P.split("/").length + 2)
      .map(([name, fields]) => ({ name, fields, t: fields[f.field.fieldPath] && fields[f.field.fieldPath].timestampValue ? Date.parse(fields[f.field.fieldPath].timestampValue) : null }))
      .filter(r => r.t !== null && r.t <= cut).sort((a, b) => a.t - b.t).slice(0, q.limit);
    return new Response(JSON.stringify(rows.length ? rows.map(r => ({ document: { name: r.name, fields: r.fields } })) : [{ readTime: "x" }]), { status: 200 });
  }
  if (u.includes(":batchGet")) {
    const { documents } = JSON.parse(init.body);
    return new Response(JSON.stringify(documents.map(n => store.has(n) ? { found: { name: n, fields: store.get(n) } } : { missing: n })), { status: 200 });
  }
  if (u.includes(":commit")) {
    const { writes } = JSON.parse(init.body);
    if (failCommitOnce && writes.length > 1) { failCommitOnce = false; return new Response("NOT_FOUND", { status: 404 }); }
    if (writes.some(w => w.currentDocument && w.currentDocument.exists && !store.has(w.delete || w.update.name))) return new Response("NOT_FOUND", { status: 404 });
    for (const w of writes) {
      if (w.delete) { store.delete(w.delete); continue; }
      if (!store.has(w.update.name)) store.set(w.update.name, {});
      const cur = store.get(w.update.name);
      for (const fp of w.updateMask.fieldPaths) {
        const ss = fp.match(/`(?:[^`\\]|\\.)*`|[^.]+/g).map(x => x.startsWith("`") ? x.slice(1, -1).replace(/\\(.)/g, "$1") : x);
        let v = { mapValue: { fields: w.update.fields } }; for (const k of ss) v = v && v.mapValue && v.mapValue.fields[k];
        let o = cur; for (const k of ss.slice(0, -1)) { o[k] = o[k] && o[k].mapValue ? o[k] : { mapValue: { fields: {} } }; o = o[k].mapValue.fields; }
        if (v === undefined) delete o[ss[ss.length - 1]]; else o[ss[ss.length - 1]] = v;
      }
      for (const t of w.updateTransforms || []) {
        const parts = t.fieldPath.split("."); let o = cur;
        for (const k of parts.slice(0, -1)) { o[k] = o[k] && o[k].mapValue ? o[k] : { mapValue: { fields: {} } }; o = o[k].mapValue.fields; }
        const last = parts[parts.length - 1]; o[last] = { integerValue: String(+((o[last] || {}).integerValue || 0) + +t.increment.integerValue) };
      }
    }
    return new Response("{}", { status: 200 });
  }
  if (u.startsWith("https://push.example/")) {
    const name = u.split("/").pop();
    if (dead.has(name)) return new Response("", { status: 410 });
    const x = devs[name];
    const plain = ece.decrypt(Buffer.from(init.body), { version: "aes128gcm", privateKey: x.e, authSecret: x.auth.toString("base64url") });
    x.got.push(JSON.parse(plain.toString()));
    return new Response("", { status: 201 });
  }
  throw new Error("unexpected fetch " + u);
}
const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
const env = { FIRESTORE_EMULATOR: "http://fake", FIREBASE_PROJECT: "demo", VAPID_PUBLIC: b64uEncode(await crypto.subtle.exportKey("raw", kp.publicKey)), VAPID_PRIVATE: (await crypto.subtle.exportKey("jwk", kp.privateKey)).d, VAPID_SUBJECT: "mailto:t@t.t" };
const run = (t, log = () => {}) => runOnce(env, t, fakeFetch, log);

// ---- the words
ok("join a list", pingText({ k: "join", n: "Priya Shah", l: "l-abcd1", ln: "Trip to Goa" }).title === "Priya joined “Trip to Goa”");
ok("join as a watcher", /Priya is now your accountability partner/.test(pingText({ k: "join", n: "Priya", w: true }).title));
const as = pingText({ k: "assign", n: "Ayush Jain", l: "l-abcd1", ln: "Trip", t: "Book flights", i: "x1y2" });
ok("a task, with a link straight to it", as.title === "Ayush gave you a task" && as.body === "“Book flights” in Trip" && as.url === "/?tab=tasks&list=l-abcd1&item=x1y2&from=social", as);
ok("a link never carries odd characters", !/javascript|\//.test(pingText({ k: "assign", n: "A", l: "javascript:alert(1)", i: "../x", t: "x" }).url.replace(/^\/\?/, "").replace(/\/?$/, "")), pingText({ k: "assign", n: "A", l: "javascript:alert(1)", i: "../x", t: "x" }).url);
ok("a cheer says what they wrote, trimmed", pingText({ k: "cheer", n: "Sam", x: "  You've   got this  " }).body === "You've got this");
ok("unknown kinds say nothing", pingText({ k: "spam", n: "x" }) === null);
const sunday6pmKolkata = Date.parse("2026-10-18T12:30:00Z");
const dg = digestText("u1", { name: "Ayush Jain", tz: "Asia/Kolkata", week: { id: "w-2026-10-12", held: 4, total: 5, cleared: 2, vals: 3 } }, sunday6pmKolkata);
ok("Sunday note: this week's numbers", dg.title === "Ayush's week" && /^4 of 5 floors held · 2 of 3 values cleared\./.test(dg.body) && dg.url === "/?tab=today&watch=u1&from=digest", dg);
ok("Sunday note: a quiet week says so kindly", /quiet this week/.test(digestText("u1", { name: "Ayush", tz: "Asia/Kolkata", week: { id: "w-2026-10-05", held: 4, total: 5 } }, sunday6pmKolkata).title));
ok("numbers someone typed are made numbers", /^0 of 0|A week without floors/.test(digestText("u1", { name: "<b>", tz: "UTC", week: { id: "w-2026-10-12", held: "<img>", total: "x" } }, Date.parse("2026-10-18T18:00:00Z")).body));
ok("quiet hours: 11 pm waits until 8 am", quietUntil("Asia/Kolkata", Date.parse("2026-10-16T17:30:00Z")) === Date.parse("2026-10-17T02:30:00Z"));
ok("quiet hours: 3 pm is fine", quietUntil("Asia/Kolkata", Date.parse("2026-10-16T09:30:00Z")) === null);
ok("next Sunday note is Sunday 6 pm their time", nextDigest({ tz: "America/New_York" }, Date.parse("2026-10-16T12:00:00Z")) === Date.parse("2026-10-18T22:00:00Z"));

// ---- end to end
const t0 = Date.parse("2026-10-16T09:30:00Z");   // 3 pm in Kolkata
put("notify/u2", { tz: "Asia/Kolkata", on: true, subs: { d1: device("priya-phone"), d2: device("priya-laptop") } });
put("notify/u3", { tz: "America/Los_Angeles", on: true, subs: { d1: device("sam-phone") } });   // 2:30 am there
put("notify/u4", { tz: "Asia/Kolkata", on: true, social: false, subs: { d1: device("muted") } });
put("pings/p1", { to: "u2", from: "u1", k: "assign", n: "Ayush", l: "l-trip1", ln: "Trip", t: "Book flights", i: "it1", due: new Date(t0 - 1000) });
put("pings/p2", { to: "u3", from: "u1", k: "cheer", n: "Ayush", x: "Nice", due: new Date(t0 - 900) });
put("pings/p3", { to: "u4", from: "u1", k: "cheer", n: "Ayush", x: "Hi", due: new Date(t0 - 800) });
put("pings/p4", { to: "nobody", from: "u1", k: "cheer", n: "Ayush", x: "Hi", due: new Date(t0 - 700) });
put("pings/p5", { to: "u2", from: "u1", k: "join", n: "Ayush", l: "l-trip1", ln: "Trip", due: new Date(t0 + 3600e3) });   // not due yet
let r = await run(t0);
ok("a task reaches every device of the person it's for", got("priya-phone").length === 1 && got("priya-laptop").length === 1 && got("priya-phone")[0].title === "Ayush gave you a task", got("priya-phone"));
ok("…and the note is gone once sent", !get("pings/p1"));
ok("asleep (2:30 am): kept, and moved to 8 am their time", got("sam-phone").length === 0 && get("pings/p2") && get("pings/p2").due === Date.parse("2026-10-16T15:00:00Z"), get("pings/p2"));
ok("someone who turned these off gets nothing, and the note is dropped", got("muted").length === 0 && !get("pings/p3"));
ok("no reminders set up at all: dropped quietly", !get("pings/p4"));
ok("not due yet: left alone", !!get("pings/p5"));
ok("the hourly count is kept", get("notify/u2").socN === 1 && /^2026-10-16T15$/.test(get("notify/u2").socH), get("notify/u2"));
ok("result counts pushes", r.sent === 2 && r.checked === 4, r);
r = await run(t0 + 5000);
ok("an overlapping run sends nothing twice", got("priya-phone").length === 1 && r.checked === 0, r);
// at 8 am in LA the cheer goes out
await run(Date.parse("2026-10-16T15:00:30Z"));
ok("after quiet hours the cheer arrives", got("sam-phone").length === 1 && got("sam-phone")[0].body === "Nice" && !get("pings/p2"), got("sam-phone"));
// rate: a flood of pings in one hour is capped (a fresh hour: 10:30 am in Kolkata the next day)
const tf = Date.parse("2026-10-17T05:00:00Z"), had = got("priya-phone").length;
for (let i = 0; i < 9; i++) put(`pings/f${i}`, { to: "u2", from: "u1", k: "cheer", n: "Ayush", x: "x" + i, due: new Date(tf - 1000 + i) });
for (let m = 0; m < 4; m++) await run(tf + m * 60e3);
ok("at most 6 notes an hour to one person; the rest are dropped", got("priya-phone").length === had + 6 && ![...store.keys()].some(k => k.includes("/pings/f")), got("priya-phone").length - had);
// a device that's gone: dropped from that person's list, the other keeps working
dead.add("priya-laptop");
put("pings/g1", { to: "u2", from: "u1", k: "cheer", n: "Ayush", x: "later", due: new Date(t0 + 7200e3) });
await run(t0 + 7200e3 + 30e3);
const n2 = get("notify/u2");
ok("a gone device is removed and marked; the phone still gets it", !n2.subs.d2 && n2.lost && n2.lost.d2 === true && got("priya-phone").some(g => g.body === "later"), n2);
// a ping whose claim fails (deleted by another run between read and commit) is not sent
put("pings/h1", { to: "u2", from: "u1", k: "cheer", n: "Ayush", x: "race", due: new Date(t0 + 9000e3) });
put("pings/h2", { to: "u2", from: "u1", k: "cheer", n: "Ayush", x: "fine", due: new Date(t0 + 9000e3 + 1) });
const before = got("priya-phone").length; failCommitOnce = true;
const realHas = store.has.bind(store); let raced = false;
store.has = k => { if (!raced && k.endsWith("/pings/h1") && failCommitOnce === false) { raced = true; store.delete(k); return false; } return realHas(k); };
await run(t0 + 9000e3 + 30e3);
store.has = realHas;
ok("a note another run already took isn't sent again; the rest still go", got("priya-phone").length === before + 1 && got("priya-phone").slice(-1)[0].body === "fine", got("priya-phone").slice(before));

// a note from days ago (the Worker wasn't deployed yet) is dropped, not sent late
const nb = got("priya-phone").length;
put("pings/old1", { to: "u2", from: "u1", k: "cheer", n: "Ayush", x: "ancient", at: t0 + 9500e3 - 3 * 864e5, due: new Date(t0 + 9500e3 - 3 * 864e5) });
await run(t0 + 9500e3);
ok("a note from 3 days ago is dropped, not sent", got("priya-phone").length === nb && !get("pings/old1"));

// ---- the Sunday note
put("notify/w1", { tz: "Asia/Kolkata", on: true, subs: { d1: device("watcher-1") } });
put("notify/w2", { tz: "Asia/Kolkata", on: true, subs: { d1: device("watcher-2") } });
put("watch/u1", { name: "Ayush Jain", tz: "Asia/Kolkata", watchers: ["w1", "w2", "stranger"], people: {}, share: "floors", week: { id: "w-2026-10-12", held: 3, total: 5, cleared: 1, vals: 3 }, nextDigest: new Date(sunday6pmKolkata) });
put("watch/u9", { name: "Paused", tz: "Asia/Kolkata", watchers: ["w1"], paused: true, nextDigest: new Date(sunday6pmKolkata + 1) });
r = await run(sunday6pmKolkata + 20e3);
ok("Sunday 6 pm: each watcher gets a note about the week", got("watcher-1").length === 1 && got("watcher-2").length === 1 && got("watcher-1")[0].title === "Ayush's week" && /^3 of 5 floors held/.test(got("watcher-1")[0].body), got("watcher-1"));
ok("…and next week's is booked", get("watch/u1").nextDigest === sunday6pmKolkata + 7 * 864e5, get("watch/u1").nextDigest);
r = await run(sunday6pmKolkata + 40e3);
ok("paused: no note, but its schedule still moves on", got("watcher-1").length === 1 && get("watch/u9").nextDigest === sunday6pmKolkata + 7 * 864e5);
// stale: the Worker was down for a day
put("watch/u1", { ...get("watch/u1"), nextDigest: new Date(sunday6pmKolkata - 864e5) });
await run(sunday6pmKolkata + 60e3);
ok("a note a day late is skipped, not sent", got("watcher-1").length === 1 && get("watch/u1").nextDigest === sunday6pmKolkata + 7 * 864e5);

const f = R.filter(x => !x.pass);
console.log(`social: ${R.length - f.length}/${R.length} passed`);
f.forEach(x => console.log("  FAIL", x.n, JSON.stringify(x.i === undefined ? "" : x.i).slice(0, 400)));
process.exit(f.length ? 1 : 0);

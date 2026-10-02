import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ece = require("http_ece");
import { encryptPayload, importVapid, pushRequest, b64uDecode, b64uEncode } from "../src/push.js";
import { nextAt, localDay, localMonday } from "../src/time.js";
import { decide } from "../src/plan.js";
const R = []; const ok = (n, c, i) => R.push({ n, pass: !!c, i });
// a fake browser subscription
const ecdh = require("crypto").createECDH("prime256v1"); ecdh.generateKeys();
const auth = require("crypto").randomBytes(16);
const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: b64uEncode(ecdh.getPublicKey()), auth: b64uEncode(auth) } };
const body = await encryptPayload(sub, JSON.stringify({ title: "Hi", body: "There" }));
const plain = ece.decrypt(Buffer.from(body), { version: "aes128gcm", privateKey: ecdh, authSecret: auth.toString("base64url") });
ok("payload decrypts like a browser would", plain.toString() === JSON.stringify({ title: "Hi", body: "There" }), plain.toString());
// VAPID
const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pub = b64uEncode(await crypto.subtle.exportKey("raw", kp.publicKey)), priv = (await crypto.subtle.exportKey("jwk", kp.privateKey)).d;
const vapid = await importVapid(pub, priv);
const [url, init] = await pushRequest(sub, { title: "x" }, vapid, { subject: "mailto:a@b.c", topic: "compass-checkin" });
const m = init.headers.Authorization.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
const claims = JSON.parse(Buffer.from(m[2], "base64url"));
const verified = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, kp.publicKey, b64uDecode(m[3]), new TextEncoder().encode(m[1] + "." + m[2]));
ok("VAPID token signed and verifiable", verified && claims.aud === "https://fcm.googleapis.com" && claims.sub === "mailto:a@b.c" && m[4] === pub && init.headers["Content-Encoding"] === "aes128gcm", claims);
// time
const iso = t => new Date(t).toISOString();
let t = nextAt("Asia/Kolkata", "21:30", Date.parse("2026-09-30T10:00:00Z"));
ok("Kolkata 9:30 pm = 16:00 UTC same day", iso(t) === "2026-09-30T16:00:00.000Z", iso(t));
t = nextAt("Asia/Kolkata", "21:30", Date.parse("2026-09-30T16:00:00Z"));
ok("strictly after: next day if already that minute", iso(t) === "2026-10-01T16:00:00.000Z", iso(t));
t = nextAt("America/New_York", "21:30", Date.parse("2026-10-31T12:00:00Z"));
ok("New York before DST ends (EDT, UTC-4)", iso(t) === "2026-11-01T01:30:00.000Z", iso(t));
t = nextAt("America/New_York", "21:30", Date.parse("2026-11-01T12:00:00Z"));
ok("New York after DST ends (EST, UTC-5)", iso(t) === "2026-11-02T02:30:00.000Z", iso(t));
t = nextAt("Europe/London", "18:00", Date.parse("2026-09-30T12:00:00Z"), 6);
ok("Sunday review in London = Sun Oct 4 17:00 UTC (BST)", iso(t) === "2026-10-04T17:00:00.000Z", iso(t));
ok("local day and Monday", localDay("Pacific/Auckland", Date.parse("2026-09-30T13:00:00Z")) === "2026-10-01" && localMonday("America/Los_Angeles", Date.parse("2026-10-05T03:00:00Z")) === "2026-09-28");
// decisions
const now = Date.parse("2026-09-30T16:00:30Z"); // 9:30 pm in Kolkata
const base = { on: true, tz: "Asia/Kolkata", eve: "21:30", rev: "18:00", sub, nextEve: Date.parse("2026-09-30T16:00:00Z"), ign: 0, last: "2026-09-29" };
let d = decide("eve", "u1", base, now);
ok("sends when not active today, and books tomorrow", d.send && d.fields.sentDay === "2026-09-30" && d.fields.ign === 1 && iso(d.fields.nextEve) === "2026-10-01T16:00:00.000Z", d);
d = decide("eve", "u1", { ...base, last: "2026-09-30" }, now);
ok("skips if they already opened Compass today", !d.send && d.why === "active today" && d.fields.nextEve);
d = decide("eve", "u1", { ...base, ign: 3, sentDay: "2026-09-29" }, now);
ok("after 3 ignored: every other day", !d.send && d.why === "every other day");
d = decide("eve", "u1", { ...base, ign: 3, sentDay: "2026-09-28" }, now);
ok("…and does send on the alternate day", !!d.send);
d = decide("eve", "u1", { ...base, ign: 6, sentDay: "2026-09-28" }, now);
ok("after 6 ignored: evenings pause", !d.send && d.why.startsWith("paused"));
d = decide("eve", "u1", { ...base, nextEve: now - 3 * 3600e3 }, now);
ok("more than 2 h late: skip, don't send at a weird hour", !d.send && d.why === "stale");
d = decide("eve", "u1", { ...base, on: false }, now);
ok("off: clears the schedule", !d.send && d.fields.nextEve === null);
const sun = Date.parse("2026-10-04T12:30:10Z"); // Sun 6:00 pm Kolkata
d = decide("rev", "u1", { ...base, nextRev: Date.parse("2026-10-04T12:30:00Z") }, sun);
ok("Sunday review sends and books next Sunday", d.send && /review/i.test(d.send.url) && iso(d.fields.nextRev) === "2026-10-11T12:30:00.000Z", d);
d = decide("rev", "u1", { ...base, nextRev: Date.parse("2026-10-04T12:30:00Z"), revDone: "2026-09-28" }, sun);
ok("skips review already done this week", !d.send && d.why === "review done");
const titles = new Set(); for (let i = 0; i < 6; i++) { const x = decide("eve", "u1", { ...base, nextEve: base.nextEve + i * 864e5 }, now + i * 864e5); titles.add(x.send.title); }
ok("wording rotates: 6 evenings, 6 different messages", titles.size === 6, [...titles]);
// CPU cost of one push (Workers free plan allows 10 ms per run)
const t0 = performance.now(); for (let i = 0; i < 40; i++) await pushRequest(sub, { title: "x", body: "y" }, vapid); const per = (performance.now() - t0) / 40;
console.log(`crypto per push ≈ ${per.toFixed(2)} ms (Node)`);
const f = R.filter(r => !r.pass); console.log(`unit: ${R.length - f.length}/${R.length} passed`); f.forEach(x => console.log("  FAIL", x.n, JSON.stringify(x.i).slice(0, 300)));
process.exit(f.length ? 1 : 0);

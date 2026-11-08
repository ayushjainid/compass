// What's left today, one-tap notification buttons, and the live calendar feed.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const nc = require("crypto");
import { openToday, listNames, signAction, readAction } from "../src/today.js";
import { enrichEvening, morningList } from "../src/index.js";
import { handleAction } from "../src/act.js";
import { handleFeed } from "../src/feed.js";
import { client } from "../src/firestore.js";
import { fakeFirestore } from "./fakefs.mjs";
const R = []; const ok = (n, c, i) => R.push({ n, pass: !!c, i });
const env = { FIRESTORE_EMULATOR: "http://fake", FIREBASE_PROJECT: "demo", VAPID_PRIVATE: "test-private-key-material" };

// Saturday 3 Oct 2026, 21:00 in Kolkata
const now = Date.parse("2026-10-03T15:30:00Z"), day = "2026-10-03", mon = "2026-09-28", wk = "w-2026-09-28";
const profile = { components: [
  { id: "sleep", name: "Slept 7+ hours", cadence: "daily", target: 5 },
  { id: "gym", name: "Gym", cadence: "daily", target: 3, block: { days: [0, 2, 5], time: "07:00", dur: 60 } },
  { id: "run", name: "Long run", cadence: "daily", target: 1, block: { days: [6], time: "06:00", dur: 90 } },        // Sunday only
  { id: "read", name: "Read", cadence: "weekly", target: 3, block: { days: [5], time: "21:30", dur: 30 } },
  { id: "call", name: "Call parents", cadence: "weekly", target: 1, block: { days: [5], time: "18:00", dur: 20 }, mvw: true },
  { id: "jr", name: "Journal", cadence: "daily", target: 5, auto: "journal" },
  { id: "old", name: "Guitar", cadence: "daily", target: 3, paused: "2026-09-21" },
  { id: "bw", name: "Big clean", cadence: "weekly", target: 1, every: 2, from: "2026-10-05", block: { days: [5] } },  // off this week
  { id: "money", name: "Budget review", cadence: "monthly", target: 1 },
  { id: "fun1", name: "Board games", fun: true },
] };
const settings = { months: { "2026-10": { plan: { money: { date: day, time: "" } } } }, cal: { alert: 10, daily: "each" } };
let items = openToday({ profile, settings, week: { days: { [day]: { a: { sleep: true } } } } }, day, mon);
ok("open today: daily on its days, weekly planned today, monthly dated today; not ticked, paused, off-week or fun", items.map(i => i.id).join() === "gym,call,read,money", items);
ok("…timed ones first, by time", items[0].id === "gym" && items[1].id === "call");
ok("kinds: daily a, planned p, monthly m", items.map(i => i.kind).join() === "a,p,p,m");
items = openToday({ profile, settings, week: { mvw: true, days: {} } }, day, mon);
ok("Minimum Viable Week keeps only the safety net", items.map(i => i.id).join() === "call", items);
items = openToday({ profile, settings: { preMvw: { [wk]: true } }, week: null }, day, mon);
ok("pre-declared MVW counts too (week not started yet)", items.map(i => i.id).join() === "call", items);
ok("names read naturally", listNames([{ name: "A" }]) === "A" && listNames([{ name: "A" }, { name: "B" }]) === "A and B" && listNames([{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }]) === "A, B and 2 more");

// ---- tokens
const tok = await signAction(env, { k: "tick", u: "alice", x: now + 1000 });
ok("token round trip", (await readAction(env, tok, now)).u === "alice");
ok("expired token refused", (await readAction(env, tok, now + 2000)) === null);
const [b, s] = tok.split("."); const forged = Buffer.from(JSON.stringify({ k: "tick", u: "mallory", x: now + 1000 })).toString("base64url") + "." + s;
ok("changed token refused", (await readAction(env, forged, now)) === null && (await readAction(env, b + ".AAAA", now)) === null);
ok("other worker's key refused", (await readAction({ VAPID_PRIVATE: "different" }, tok, now)) === null);

// ---- evening reminder details
const fs = fakeFirestore(), fetchFn = (u, i) => fs.fetch(u, i), db = client(env, fetchFn);
const seed = (uid, extra = {}) => { fs.put(`users/${uid}/docs/profile`, profile); fs.put(`users/${uid}/docs/settings`, settings); fs.put(`users/${uid}/docs/${wk}`, { kind: "week", start: mon, days: { [day]: { a: { sleep: true } } }, c: { read: 1 }, r: {} }); fs.put(`notify/${uid}`, { on: true, tz: "Asia/Kolkata", eve: "21:00", ign: 2, ...extra }); };
seed("alice");
const base = { title: "Quick one", body: "Did today count?", url: "/?from=checkin", tag: "compass-checkin" };
let p = await enrichEvening(env, db, "alice", { tz: "Asia/Kolkata" }, base, now);
ok("4 left: lists them, offers snooze (too many to tick)", /Open: Gym, Call parents and 2 more\./.test(p.body) && p.actions.length === 1 && p.actions[0].action === "snooze" && p.act.snooze, p);
fs.put(`users/alice/docs/${wk}`, { kind: "week", start: mon, days: { [day]: { a: { sleep: true, gym: true }, p: { read: true } } }, c: { read: 2 }, r: {} });
p = await enrichEvening(env, db, "alice", { tz: "Asia/Kolkata" }, base, now);
ok("2 left: a tick button for each", p.actions.map(a => a.title).join("|") === "✓ Call parents|✓ Budget review" && p.act.tick0 && p.act.tick1, p.actions);
const hidden = await enrichEvening(env, db, "alice", { tz: "Asia/Kolkata", names: false }, base, now);
ok("names hidden: count only, snooze only", /2 still open\.$/.test(hidden.body) && !/Call/.test(JSON.stringify(hidden.actions)) && hidden.actions[0].action === "snooze", hidden);
ok("one read for all three documents", fs.calls.filter(c => c.includes("batchGet")).length === 3);
ok("evening: says how many are left, for the caller to drop an empty one", p.left === 2 && hidden.left === 2);
const mb = { title: "Today's floors", body: "", url: "/?tab=today&from=morning", tag: "compass-morning" };
let mp = await morningList(db, "alice", { tz: "Asia/Kolkata" }, mb, now);
ok("morning glance: today's open floors by name", /^Call parents and Budget review\.$/.test(mp.body), mp.body);
mp = await morningList(db, "alice", { tz: "Asia/Kolkata", names: false }, mb, now);
ok("…or just how many, with names off", mp.body === "2 floors today.", mp.body);
const prof2 = JSON.parse(JSON.stringify(profile)); (prof2.components.find(c => c.cadence === "daily" && c.id !== "sleep") || {}).dflt = true;
fs.put("users/bob/docs/profile", prof2); fs.put("users/bob/docs/settings", settings); fs.put(`users/bob/docs/${wk}`, { kind: "week", start: mon, days: {}, c: {}, r: {} });
const bobOpen = (await enrichEvening(env, db, "bob", { tz: "Asia/Kolkata" }, base, now)).left, aliceLike = openToday({ profile, settings, week: { days: {} } }, day, mon).length;
ok("a floor that counts by default isn't 'left'", bobOpen === aliceLike - 1, { bobOpen, aliceLike });

// ---- tapping the buttons
const post = (t, at = now) => handleAction(new Request("https://w/act", { method: "POST", body: JSON.stringify({ t }) }), env, fetchFn, at);
let r = await post(p.act.tick0); let j = await r.json();
let w = fs.get(`users/alice/docs/${wk}`);
ok("tick weekly: marked done today and counted once", r.status === 200 && j.ok && w.days[day].p.call === true && w.c.call === 1, { j, w });
ok("…other days and counts untouched", w.days[day].a.gym === true && w.c.read === 2 && w.r && w.kind === "week");
ok("…counts as engagement (last = today, ignores reset)", fs.get("notify/alice").last === day && fs.get("notify/alice").ign === 0);
// a tap the next morning on last night's button: logs it, but doesn't move "last" back
fs.put("notify/dave", { on: true, tz: "Asia/Kolkata", last: "2026-10-04", ign: 3 }); fs.put(`users/dave/docs/${wk}`, { kind: "week", start: mon, days: {}, c: {}, r: {} });
r = await post(await signAction(env, { k: "tick", u: "dave", d: day, w: wk, c: "gym", t: "a", s: 1, z: "Asia/Kolkata", x: now + 18 * 3600e3 }), Date.parse("2026-10-04T02:30:00Z"));
ok("next-morning tap: logged for that day, 'last' stays today", r.status === 200 && fs.get(`users/dave/docs/${wk}`).days[day].a.gym === true && fs.get("notify/dave").last === "2026-10-04" && fs.get("notify/dave").ign === 0, fs.get("notify/dave"));
// two taps at the same moment: the second sees the first and doesn't count again
fs.put(`users/erin/docs/${wk}`, { kind: "week", start: mon, days: {}, c: {}, r: {} }); fs.put("notify/erin", { on: true, tz: "Asia/Kolkata" });
const te = await signAction(env, { k: "tick", u: "erin", d: day, w: wk, c: "read", t: "p", s: 1, z: "Asia/Kolkata", x: now + 3600e3 });
let raced = false; fs.beforeCommit = async writes => { if (!raced && writes[0].update.name.endsWith(wk) && writes[0].update.name.includes("erin")) { raced = true; await post(te); } };
r = await post(te); fs.beforeCommit = null; j = await r.json(); w = fs.get(`users/erin/docs/${wk}`);
ok("two taps at once count once", raced && w.c.read === 1 && w.days[day].p.read === true, { j, c: w.c });
r = await post(p.act.tick0); j = await r.json(); w = fs.get(`users/alice/docs/${wk}`);
ok("tapping twice changes nothing", j.already && w.c.call === 1, { j, c: w.c });
r = await post(p.act.tick1); w = fs.get(`users/alice/docs/${wk}`);
ok("tick monthly: marked today, +1 in the month of the week's Monday (as the app counts it)", r.status === 200 && w.days[day].p.money === true && fs.get("users/alice/docs/settings").months["2026-09"].c.money === 1 && !(fs.get("users/alice/docs/settings").months["2026-10"].c), fs.get("users/alice/docs/settings").months);
ok("server writes carry a fresh save marker, so the app merges them", /^srv:0:\d+$/.test(w._w), w._w);
// a daily floor, in a week document that doesn't exist yet
seed("bob"); fs.store.delete(`projects/demo/databases/(default)/documents/users/bob/docs/${wk}`);
const tb = await signAction(env, { k: "tick", u: "bob", d: day, w: wk, c: "gym", t: "a", s: 1, n: "Gym", x: now + 3600e3 });
r = await post(tb); w = fs.get(`users/bob/docs/${wk}`);
ok("tick daily into a new week: creates it with kind and start", r.status === 200 && w.days[day].a.gym === true && w.kind === "week" && w.start === mon && !w.c, w);
r = await post(await signAction(env, { k: "snooze", u: "alice", d: day, z: "Asia/Kolkata", x: Date.parse("2026-10-03T19:00:00Z") }), Date.parse("2026-10-03T18:40:00Z"));   // 00:10 the next day there
j = await r.json();
ok("snooze after midnight: no more nudges that day", j.late && !fs.get("notify/alice").nextEve, j);
r = await post(p.act.snooze || hidden.act.snooze); j = await r.json();
const ne = fs.get("notify/alice").nextEve;
ok("snooze: next reminder in an hour", r.status === 200 && Math.abs(ne - (now + 3600e3)) < 2000, { j, ne });
r = await post(await signAction(env, { k: "tick", u: "alice", d: day, w: wk, c: "gym", t: "a", x: now - 1 }));
ok("expired button: refused, nothing written", r.status === 403);
fs.store.delete(`projects/demo/databases/(default)/documents/notify/carol`);
r = await post(await signAction(env, { k: "tick", u: "carol", d: day, w: wk, c: "gym", t: "a", s: 1, x: now + 1000 }));
ok("account deleted since: refused and nothing created", r.status === 410 && !fs.get(`users/carol/docs/${wk}`), r.status);
r = await handleAction(new Request("https://w/act", { method: "OPTIONS" }), env, fetchFn, now);
ok("CORS preflight answered", r.status === 204 && r.headers.get("access-control-allow-origin") === "*");

// ---- calendar feed
const token = nc.randomBytes(32).toString("base64url");
fs.put(`calfeeds/${token}`, { uid: "alice", tz: "Asia/Kolkata", at: 1 });
fs.put("users/alice/docs/settings", { ...settings, calFeed: token, calTasks: [
  { i: "t1", t: "Dentist; bring card", d: "2026-10-05", m: "09:30" },     // two days after the feed's today
  { i: "t0", t: "Old thing", d: "2020-01-01", m: "09:00" },               // long past: left out
  { i: "../x", t: "No time", d: "2026-10-01" },                            // no time: left out
] });
fs.put("users/alice/docs/profile", { ...profile, components: profile.components.map(c => c.id === "sleep" ? { ...c, note: "private: insomnia meds" } : c) });
const feed = path => handleFeed(new Request("https://w" + path), env, fetchFn, now);
r = await feed(`/cal/${token}.ics`); let txt = await r.text();
ok("feed: a calendar", r.status === 200 && /text\/calendar/.test(r.headers.get("content-type")) && /^BEGIN:VCALENDAR/.test(txt) && /END:VCALENDAR\r\n$/.test(txt));
ok("feed: floors with times in their zone", /SUMMARY:Gym/.test(txt) && /DTSTART;TZID=Asia\/Kolkata:\d{8}T070000/.test(txt) && /RRULE:FREQ=WEEKLY;BYDAY=MO,WE,SA/.test(txt), txt.slice(0, 600));
ok("feed: paused and fun floors left out", !/Guitar/.test(txt) && !/Board games/.test(txt));
ok("feed: every-2-weeks keeps its interval", /RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SA/.test(txt));
ok("feed: monthly dated floor, untimed daily as all-day", /SUMMARY:Budget review/.test(txt) && /SUMMARY:Slept 7\+ hours/.test(txt) && /RRULE:FREQ=DAILY/.test(txt));
ok("feed: their alert choice (10 min) and a refresh hint", /TRIGGER:-PT10M/.test(txt) && /REFRESH-INTERVAL;VALUE=DURATION:PT6H/.test(txt));
ok("feed: not cached by shared caches", /private/.test(r.headers.get("cache-control")));
ok("feed: tasks with a time, as half-hour events in their zone", /UID:compass-task-t1@/.test(txt) && /SUMMARY:Dentist\\; bring card/.test(txt) && /DTSTART;TZID=Asia\/Kolkata:20261005T093000/.test(txt) && /DTEND;TZID=Asia\/Kolkata:20261005T100000/.test(txt), (txt.match(/BEGIN:VEVENT[\s\S]*?compass-task[\s\S]*?END:VEVENT/) || [""])[0]);
ok("feed: past tasks and ones without a time are left out", !/Old thing/.test(txt) && !/No time/.test(txt));
ok("feed: floor notes never published", !/insomnia/.test(txt));
ok("feed: keeps recent history (starts 8 weeks back)", /DTSTART;TZID=Asia\/Kolkata:202608\d\dT070000/.test(txt), (txt.match(/DTSTART[^\r]*/g) || []).slice(0, 4));
const old = nc.randomBytes(32).toString("base64url"); fs.put(`calfeeds/${old}`, { uid: "alice", tz: "Asia/Kolkata", at: 1 });
r = await feed(`/cal/${old}.ics`); ok("a link left behind by a reset is dead (only the current one works)", r.status === 404);
r = await feed(`/cal/${nc.randomBytes(32).toString("base64url")}.ics`);
ok("unknown link: 404", r.status === 404);
r = await feed(`/cal/short.ics`); ok("malformed link: 404 without a lookup", r.status === 404);
fs.store.delete(`projects/demo/databases/(default)/documents/users/alice/docs/profile`);
r = await feed(`/cal/${token}.ics`); ok("account gone: 404", r.status === 404);

// ---- the first Sunday of a month mentions the look-back
const { decide } = await import("../src/plan.js");
const sub = { endpoint: "https://push.example/x" };
let dr = decide("rev", "alice", { on: true, sub, tz: "Asia/Kolkata", rev: "18:00", nextRev: Date.parse("2026-10-04T12:30:00Z") }, Date.parse("2026-10-04T12:30:10Z"));
ok("first Sunday of October: mentions September's look-back", /Your September look-back is ready too\./.test(dr.send.body), dr.send);
dr = decide("rev", "alice", { on: true, sub, tz: "Asia/Kolkata", rev: "18:00", nextRev: Date.parse("2026-10-11T12:30:00Z") }, Date.parse("2026-10-11T12:30:10Z"));
ok("later Sundays don't", !/look-back/.test(dr.send.body), dr.send);
dr = decide("rev", "alice", { on: true, sub, tz: "Asia/Kolkata", rev: "18:00", nextRev: Date.parse("2027-01-03T12:30:00Z") }, Date.parse("2027-01-03T12:30:10Z"));
ok("January's first Sunday names December", /Your December look-back is ready too/.test(dr.send.body), dr.send);

/* ---- the Sunday email ---- */
{
  const { mailBody, mailWork } = await import("../src/mail.js");
  const m = mailBody({ days: { "2026-11-02": { a: { read: true, gym: false }, j: { win: "Walked <home> with Dad" } }, "2026-11-03": { a: { read: true } } }, c: { gym: 2 } }, "https://app.test");
  ok("email: counts what was logged, in plain words", /^4 things logged across 2 days this week\./.test(m.text), m.text);
  ok("…quotes your own lines, escaped in the HTML", /Walked <home> with Dad/.test(m.text) && /Walked &lt;home&gt; with Dad/.test(m.html) && !/<home>/.test(m.html));
  ok("…links to the review and says how to turn it off", /https:\/\/app\.test\/\?tab=review&from=mail/.test(m.text) && /Compass → Reminders/.test(m.text));
  const sent = [], patched = [];
  const db = { due: async () => [{ name: "n/u1", id: "u1", data: { mail: true, mailTo: "me@example.com", tz: "UTC", rev: "18:00", nextMail: Date.parse("2026-11-08T18:00:00Z") } }, { name: "n/u2", id: "u2", data: { mail: true, mailTo: "not an email", tz: "UTC", nextMail: Date.parse("2026-11-08T18:00:00Z") } }],
    patch: async w => patched.push(...w), getMany: async ps => Object.fromEntries(ps.map(p => [p, { days: {}, c: {} }])) };
  const fetchFn = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200 }; };
  let r = await mailWork({}, db, Date.parse("2026-11-08T18:00:30Z"), fetchFn, () => {});
  ok("email: off without a Resend key", r.mailed === 0 && !sent.length);
  r = await mailWork({ RESEND_API_KEY: "k", MAIL_FROM: "Compass <hi@x.test>" }, db, Date.parse("2026-11-08T18:00:30Z"), fetchFn, () => {});
  ok("…sends to the address they gave, only that one", r.mailed === 1 && sent.length === 1 && sent[0].body.to[0] === "me@example.com" && sent[0].url === "https://api.resend.com/emails", sent);
  ok("…and books next Sunday for each", patched.length === 2 && patched.every(p => p.fields.nextMail && new Date(p.fields.nextMail).toISOString() === "2026-11-15T18:00:00.000Z"), patched.map(p => p.fields));
}

const f = R.filter(x => !x.pass); f.forEach(x => console.log("  FAIL", x.n, String(JSON.stringify(x.i)).slice(0, 500)));
console.log(`features: ${R.length - f.length}/${R.length} passed`); process.exit(f.length ? 1 : 0);


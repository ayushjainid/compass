// Compass check-in reminders. Runs every minute on Cloudflare's cron.
//
// Each run: find `notify/*` documents whose next evening check-in or Sunday review is due,
// move their schedule forward (one commit, so overlapping runs can't double-send),
// then send the pushes that are still wanted. Free-plan budget: at most 50 outbound
// requests and 10 ms of CPU per run, so a run handles up to PER_RUN people; anyone left
// over is picked up by the next minute's run.
import { client } from "./firestore.js";
import { decide } from "./plan.js";
import { importVapid, pushRequest } from "./push.js";
import { localDay, localMonday, validTz } from "./time.js";
import { openToday, listNames, signAction, weekId } from "./today.js";
import { handleFeed } from "./feed.js";
import { handleAction } from "./act.js";

/** The evening reminder says what's left today and, when it's one or two things, offers to tick them
    right from the notification; otherwise "Remind me in an hour". Hidden names → only the snooze button. */
export async function enrichEvening(env, db, uid, d, payload, now) {
  const tz = validTz(d.tz) ? d.tz : "UTC", day = localDay(tz, now), mon = localMonday(tz, now);
  const base = `users/${uid}/docs/`;
  const got = await db.getMany([base + "profile", base + "settings", base + weekId(mon)]);
  const items = openToday({ profile: got[base + "profile"], settings: got[base + "settings"], week: got[base + weekId(mon)] }, day, mon);
  const x = now + 18 * 3600e3, names = d.names !== false;
  const out = { ...payload, actions: [], act: {} };
  if (items.length && names) out.body = `${payload.body}\n${items.length === 1 ? "Left today" : `${items.length} left today`}: ${listNames(items)}.`;
  else if (items.length) out.body = `${payload.body}\n${items.length} left today.`;
  if (names && items.length && items.length <= 2) {
    for (const [i, it] of items.entries()) {
      const key = "tick" + i;
      out.actions.push({ action: key, title: "✓ " + it.name.slice(0, 28) });
      out.act[key] = await signAction(env, { k: "tick", u: uid, d: day, w: weekId(mon), c: it.id, t: it.kind, s: it.step || 1, n: it.name.slice(0, 40), z: tz, x });
    }
  } else {
    out.actions.push({ action: "snooze", title: "Remind me in an hour" });
    out.act.snooze = await signAction(env, { k: "snooze", u: uid, d: day, z: tz, x: now + 6 * 3600e3 });
  }
  return out;
}

// Free plan: 10 ms of CPU per run and ~1 ms of crypto per push, so 8 a minute is the safe ceiling.
// On Workers Paid ($5/month) set PER_RUN to e.g. 200 in wrangler.toml.
export const PER_RUN = 8;

// Health: the Worker notes how it's doing in `status/reminders` (read by the owner's dashboard, stats.html):
// every 10 minutes when idle, after any run that sent something, and on every error.
export const BEAT_EVERY = 10;
const day = ms => new Date(ms).toISOString().slice(0, 10);
export async function heartbeat(db, now, r, err) {
  const busy = r && (r.sent || r.checked), tick = new Date(now).getUTCMinutes() % BEAT_EVERY === 0;
  if (!err && !busy && !tick) return false;
  const f = { at: new Date(now), ok: !err };
  if (err) { f.lastError = String(err.message || err).slice(0, 300); f.lastErrorAt = new Date(now); }
  if (r && r.sent) f.lastSendAt = new Date(now);
  const d = day(now).replace(/-/g, "");
  await db.upsert("status/reminders", f, { [`sent.d${d}`]: (r && r.sent) || 0, [`failed.d${d}`]: (r && r.failed) || 0, [`errors.d${d}`]: err ? 1 : 0 });
  return true;
}

export async function runOnce(env, now = Date.now(), fetchFn = fetch, log = console.log) {
  const db = client(env, fetchFn);
  let r;
  try { r = await work(env, db, now, fetchFn, log); }
  catch (e) { try { await heartbeat(db, now, null, e); } catch (e2) { log("heartbeat failed: " + e2.message); } throw e; }
  try { await heartbeat(db, now, r); } catch (e) { log("heartbeat failed: " + e.message); }
  return r;
}

async function work(env, db, now, fetchFn, log) {
  const cap = Math.max(2, Math.min(400, +env.PER_RUN || PER_RUN)), revCap = Math.max(1, Math.round(cap / 5));
  const [eve, rev] = await Promise.all([db.due("notify", "nextEve", now, cap - revCap), db.due("notify", "nextRev", now, revCap)]);
  const jobs = eve.map(x => ({ kind: "eve", ...x })).concat(rev.map(x => ({ kind: "rev", ...x })));
  if (!jobs.length) return { checked: 0, sent: 0, failed: 0 };

  // decide; a person due for both in the same minute gets both updates merged into one write
  const byDoc = new Map(), sends = [];
  for (const j of jobs) {
    const r = decide(j.kind, j.id, j.data, now);
    const cur = byDoc.get(j.name) || { name: j.name, fields: {} };
    Object.assign(cur.fields, r.fields);
    byDoc.set(j.name, cur);
    if (r.send) sends.push({ ...j, payload: r.send });
    log(`${j.kind} ${j.id.slice(0, 6)}… ${r.why}`);
  }
  const updates = [...byDoc.values()];
  let claimed = new Set(updates.map(u => u.name));
  try { await db.patch(updates); }
  catch (e) {
    // one document vanished mid-run (account deleted): claim the rest one by one
    claimed = new Set();
    for (const u of updates) { try { await db.patch([u]); claimed.add(u.name); } catch (e2) { log("skip " + u.name.split("/").pop()); } }
  }

  if (!env.VAPID_PUBLIC || !env.VAPID_PRIVATE) throw new Error("VAPID keys are not set");
  /* evening reminders say what's left and carry one-tap buttons; if that lookup fails, the plain reminder still goes */
  for (const s of sends) if (s.kind === "eve" && claimed.has(s.name)) { try { s.payload = await enrichEvening(env, db, s.id, s.data, s.payload, now); } catch (e) { log("enrich failed: " + e.message); } }
  const vapid = await importVapid(env.VAPID_PUBLIC, env.VAPID_PRIVATE);
  const dead = [];
  let sent = 0, failed = 0;
  await Promise.all(sends.filter(s => claimed.has(s.name)).map(async s => {
    try {
      const [url, init] = await pushRequest(s.data.sub, s.payload, vapid, { subject: env.VAPID_SUBJECT, ttl: s.kind === "eve" ? 3 * 3600 : 12 * 3600, topic: s.payload.tag });
      const r = await fetchFn(url, init);
      if (r.status === 404 || r.status === 410) dead.push(s.name);       // unsubscribed or expired
      else if (r.ok) sent++;
      else { failed++; log(`push ${r.status} for ${s.id.slice(0, 6)}…`); }
    } catch (e) { failed++; log("push failed: " + e.message); }
  }));
  if (dead.length) {
    try { await db.patch(dead.map(name => ({ name, fields: { on: false, sub: null, nextEve: null, nextRev: null } }))); } catch (e) { log("cleanup failed: " + e.message); }
  }
  return { checked: jobs.length, sent, failed, dead: dead.length };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runOnce(env, event.scheduledTime || Date.now()).then(r => console.log(JSON.stringify(r))));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/cal/")) return handleFeed(request, env);
    if (url.pathname === "/act") return handleAction(request, env);
    // A tiny health check so you can see the Worker is alive in a browser.
    return new Response("Compass reminders are running.", { headers: { "Content-Type": "text/plain" } });
  },
};

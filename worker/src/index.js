// Compass check-in reminders. Runs every minute on Cloudflare's cron.
//
// Each run: find `notify/*` documents whose next evening check-in or Sunday review is due,
// move their schedule forward (one commit, so overlapping runs can't double-send),
// then send the pushes that are still wanted. Free-plan budget: at most 50 outbound
// requests and 10 ms of CPU per run, so a run handles up to PER_RUN people; anyone left
// over is picked up by the next minute's run.
import { client } from "./firestore.js";
import { decide, targets } from "./plan.js";
import { importVapid, pushRequest, refusal } from "./push.js";
import { localDay, localMonday, validTz } from "./time.js";
import { openToday, listNames, signAction, weekId } from "./today.js";
import { handleFeed } from "./feed.js";
import { handleAction } from "./act.js";
import { pingText, digestText, nextDigest, quietUntil, hourKey, PER_HOUR, STALE_DIGEST_MS } from "./social.js";

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
  if (r && r.lastErr) { f.lastPushError = r.lastErr; f.lastPushErrorAt = new Date(now); }
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
  const cap = Math.max(2, Math.min(400, +env.PER_RUN || PER_RUN)), revCap = Math.max(1, Math.round(cap / 5)), testCap = 2;
  const [eve, rev, test] = await Promise.all([db.due("notify", "nextEve", now, cap - revCap), db.due("notify", "nextRev", now, revCap), db.due("notify", "nextTest", now, testCap)]);
  const jobs = eve.map(x => ({ kind: "eve", ...x })).concat(rev.map(x => ({ kind: "rev", ...x })), test.map(x => ({ kind: "test", ...x })));
  const sends = [];
  if (jobs.length) {
    // decide; a person due for several in the same minute gets all updates merged into one write
    const byDoc = new Map(), mine = [];
    for (const j of jobs) {
      const r = decide(j.kind, j.id, j.data, now);
      const cur = byDoc.get(j.name) || { name: j.name, fields: {} };
      Object.assign(cur.fields, r.fields);
      byDoc.set(j.name, cur);
      if (r.send) mine.push({ ...j, payload: r.send });
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
    sends.push(...mine.filter(s => claimed.has(s.name)));
  }
  /* notes between people (a join, a task, a cheer, the Sunday note to watchers): with what's left of this minute's budget */
  let soc = { checked: 0, sends: [] };
  if (cap - sends.length >= 2) { try { soc = await socialWork(db, now, cap - sends.length, log); } catch (e) { log("social: " + e.message); } }
  sends.push(...soc.sends);
  if (!jobs.length && !soc.checked) return { checked: 0, sent: 0, failed: 0 };

  if (!env.VAPID_PUBLIC || !env.VAPID_PRIVATE) throw new Error("VAPID keys are not set");
  /* evening reminders say what's left and carry one-tap buttons; if that lookup fails, the plain reminder still goes */
  for (const s of sends) if (s.kind === "eve") { try { s.payload = await enrichEvening(env, db, s.id, s.data, s.payload, now); } catch (e) { log("enrich failed: " + e.message); } }
  const vapid = await importVapid(env.VAPID_PUBLIC, env.VAPID_PRIVATE);
  /* signed tokens saved between runs (Apple: don't make a new one more than hourly) */
  const store = await jwtStore(db, log);
  const results = new Map();   // notify doc name -> [{ d, dev, ok, s, r }]
  let sent = 0, failed = 0, lastErr = "";
  const out = [];
  for (const s of sends) for (const t of targets(s.data)) out.push({ s, t });
  await Promise.all(out.map(async ({ s, t }) => {
    const res = { d: t.dev, dev: t.label, ok: false, s: 0, r: "" };
    try {
      const [url, init] = await pushRequest({ endpoint: t.endpoint, keys: t.keys }, s.payload, vapid, { subject: env.VAPID_SUBJECT, ttl: s.kind === "eve" ? 3 * 3600 : s.kind === "test" ? 600 : s.kind === "social" ? 6 * 3600 : 12 * 3600, topic: s.payload.tag, store });
      const r = await fetchFn(url, init);
      res.s = r.status;
      if (r.ok) { res.ok = true; sent++; }
      else {
        res.r = r.status === 404 || r.status === 410 ? "gone" : await refusal(r);
        if (r.status !== 404 && r.status !== 410) { failed++; lastErr = `${r.status} ${res.r} (${new URL(t.endpoint).host})`; log(`push ${r.status} ${res.r} for ${s.id.slice(0, 6)}…`); }
      }
    } catch (e) { failed++; res.r = String(e.message || e).slice(0, 80); lastErr = res.r; log("push failed: " + e.message); }
    if (!results.has(s.name)) results.set(s.name, []);
    results.get(s.name).push(res);
  }));
  await store.save();

  /* write back: devices whose address is gone are dropped (and marked, so that device offers to reconnect);
     a test gets its results so the app can say what happened */
  let dead = 0;
  const kinds = new Map(); for (const s of sends) { if (!kinds.has(s.name)) kinds.set(s.name, new Set()); kinds.get(s.name).add(s.kind); }
  for (const [name, list] of results) {
    const path = name.split("/documents/")[1], sets = [];
    for (const r of list) if (r.s === 404 || r.s === 410) {
      dead++;
      if (r.d) { sets.push([["subs", r.d], undefined], [["lost", r.d], true]); }
      else sets.push([["sub"], null], [["on"], false], [["nextEve"], null], [["nextRev"], null]);   // the one address from before: off, as before
    }
    if (kinds.get(name).has("test")) sets.push([["test"], { at: new Date(now), res: list.map(r => ({ d: r.d, dev: r.dev, ok: r.ok, s: r.s, r: r.r })) }]);
    if (sets.length) { try { await db.setPaths(path, sets, [], { mustExist: true }); } catch (e) { log("write-back failed: " + e.message); } }
  }
  return { checked: jobs.length + soc.checked, sent, failed, dead, lastErr };
}

/** Pings and Sunday notes due now: claimed (deleted, moved past quiet hours, or rescheduled) in one commit before
    anything is sent, so an overlapping run can't send them twice. Returns sends shaped like the reminders'. */
export async function socialWork(db, now, room, log = () => {}) {
  const [pings, digs] = await Promise.all([db.due("pings", "due", now, Math.min(6, room)), room >= 4 ? db.due("watch", "nextDigest", now, 1) : Promise.resolve([])]);
  if (!pings.length && !digs.length) return { checked: 0, sends: [] };
  const who = new Set();
  pings.forEach(p => { if (typeof p.data.to === "string" && p.data.to) who.add(p.data.to); });
  digs.forEach(d => (Array.isArray(d.data.watchers) ? d.data.watchers : []).slice(0, 5).forEach(u => { if (typeof u === "string" && u) who.add(u); }));
  const nd = who.size ? await db.getMany([...who].map(u => "notify/" + u)) : {};
  const reach = u => { const n = nd["notify/" + u]; return n && n.social !== false && targets(n).length ? n : null; };
  const used = new Map(), usedBy = u => { if (!used.has(u)) { const n = nd["notify/" + u]; used.set(u, n && n.socH === hourKey(n.tz, now) ? +n.socN || 0 : 0); } return used.get(u); };
  const writes = [], sends = [];
  const send = (u, payload, kind, claim) => { used.set(u, usedBy(u) + 1); sends.push({ kind, id: u, name: db.full("notify/" + u), data: nd["notify/" + u], payload, claim }); };
  for (const p of pings) {
    const d = p.data, n = reach(d.to), txt = pingText(d);
    if (!n || !txt) { writes.push({ del: p.name }); log(`ping ${p.id.slice(0, 6)}… dropped (${txt ? "no device" : "unknown"})`); continue; }
    const q = quietUntil(n.tz, now);
    if (q) { writes.push({ name: p.name, fields: { due: new Date(q) } }); log(`ping ${p.id.slice(0, 6)}… after quiet hours`); continue; }
    writes.push({ del: p.name });
    if (usedBy(d.to) >= PER_HOUR) { log(`ping ${p.id.slice(0, 6)}… dropped (too many this hour)`); continue; }
    send(d.to, txt, "social", writes.length - 1);
  }
  for (const g of digs) {
    const w = g.data, nx = nextDigest(w, now);
    writes.push({ name: g.name, fields: { nextDigest: nx ? new Date(nx) : null } });
    const claim = writes.length - 1;
    if (w.paused || !Array.isArray(w.watchers) || !w.watchers.length) { log(`digest ${g.id.slice(0, 6)}… nobody to tell`); continue; }
    if (w.nextDigest && now - w.nextDigest > STALE_DIGEST_MS) { log(`digest ${g.id.slice(0, 6)}… stale`); continue; }
    const txt = digestText(g.id, w, now);
    for (const u of w.watchers.slice(0, 5)) { if (typeof u !== "string" || !reach(u) || quietUntil(reach(u).tz, now) || usedBy(u) >= PER_HOUR) continue; send(u, txt, "digest", claim); }
    log(`digest ${g.id.slice(0, 6)}… to ${sends.filter(s => s.claim === claim).length}`);
  }
  /* the hourly count rides along in the same commit (a counter, not a claim) */
  for (const u of new Set(sends.map(s => s.id))) { const n = nd["notify/" + u]; writes.push({ name: db.full("notify/" + u), fields: { socH: hourKey(n.tz, now), socN: used.get(u) } }); }
  let ok = new Set(writes.map((_, i) => i));
  try { await db.commit(writes); }
  catch (e) { ok = new Set(); for (const [i, w] of writes.entries()) { try { await db.commit([w]); ok.add(i); } catch (e2) { log("social: skipped one (gone)"); } } }
  return { checked: pings.length + digs.length, sends: sends.filter(s => ok.has(s.claim)) };
}

/* signed VAPID tokens kept in status/vapid between runs */
async function jwtStore(db, log) {
  let saved = {}, dirty = false;
  try { saved = (await db.getMany(["status/vapid"]))["status/vapid"] || {}; } catch (e) { log("vapid store: " + e.message); }
  return {
    get: k => saved[k],
    set: (k, v) => { saved[k] = v; dirty = true; },
    async save() { if (!dirty) return; try { await db.upsert("status/vapid", saved); } catch (e) { log("vapid store save: " + e.message); } },
  };
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

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

// Free plan: 10 ms of CPU per run and ~1 ms of crypto per push, so 8 a minute is the safe ceiling.
// On Workers Paid ($5/month) set PER_RUN to e.g. 200 in wrangler.toml.
export const PER_RUN = 8;

export async function runOnce(env, now = Date.now(), fetchFn = fetch, log = console.log) {
  const db = client(env, fetchFn);
  const cap = Math.max(2, Math.min(400, +env.PER_RUN || PER_RUN)), revCap = Math.max(1, Math.round(cap / 5));
  const [eve, rev] = await Promise.all([db.due("notify", "nextEve", now, cap - revCap), db.due("notify", "nextRev", now, revCap)]);
  const jobs = eve.map(x => ({ kind: "eve", ...x })).concat(rev.map(x => ({ kind: "rev", ...x })));
  if (!jobs.length) return { checked: 0, sent: 0 };

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
  const vapid = await importVapid(env.VAPID_PUBLIC, env.VAPID_PRIVATE);
  const dead = [];
  let sent = 0;
  await Promise.all(sends.filter(s => claimed.has(s.name)).map(async s => {
    try {
      const [url, init] = await pushRequest(s.data.sub, s.payload, vapid, { subject: env.VAPID_SUBJECT, ttl: s.kind === "eve" ? 3 * 3600 : 12 * 3600, topic: s.payload.tag });
      const r = await fetchFn(url, init);
      if (r.status === 404 || r.status === 410) dead.push(s.name);       // unsubscribed or expired
      else if (r.ok) sent++;
      else log(`push ${r.status} for ${s.id.slice(0, 6)}…`);
    } catch (e) { log("push failed: " + e.message); }
  }));
  if (dead.length) {
    try { await db.patch(dead.map(name => ({ name, fields: { on: false, sub: null, nextEve: null, nextRev: null } }))); } catch (e) { log("cleanup failed: " + e.message); }
  }
  return { checked: jobs.length, sent, dead: dead.length };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runOnce(env, event.scheduledTime || Date.now()).then(r => console.log(JSON.stringify(r))));
  },
  // A tiny health check so you can see the Worker is alive in a browser.
  async fetch() {
    return new Response("Compass reminders are running.", { headers: { "Content-Type": "text/plain" } });
  },
};

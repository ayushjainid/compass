// One-tap buttons on the evening reminder: POST /act { t: <signed token> }.
// tick → marks that floor done for that day (like tapping it on Today); snooze → reminds again in an hour.
// Tokens are signed by this Worker, name one person, one day and one floor, and expire, so they can't be
// forged or reused for anything else. A second tap on the same tick changes nothing.
import { client } from "./firestore.js";
import { readAction } from "./today.js";
import { localDay, validTz } from "./time.js";
import { parse, monthKey } from "../../public/shared/ics.js";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" };
const reply = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function handleAction(request, env, fetchFn = fetch, now = Date.now()) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return reply(405, { ok: false });
  let t = ""; try { const txt = await request.text(); t = (JSON.parse(txt || "{}").t) || ""; } catch (e) { return reply(400, { ok: false }); }
  const a = await readAction(env, t, now); if (!a) return reply(403, { ok: false, why: "expired or invalid" });
  const db = client(env, fetchFn);
  try {
    const tz = validTz(a.z) ? a.z : "UTC", today = localDay(tz, now);
    if (a.k === "snooze") {
      /* only within the same evening: never a nudge after midnight about tomorrow */
      if (localDay(tz, now + 3600e3) !== a.d) return reply(200, { ok: true, late: true, msg: "It's late, so no more nudges today. See you tomorrow." });
      await db.setPaths(`notify/${a.u}`, [[["nextEve"], new Date(now + 3600e3)], [["ign"], 0]], [], { mustExist: true });
      return reply(200, { ok: true, msg: "OK, I'll nudge you again in an hour." });
    }
    if (a.k === "tick" && /^w-\d{4}-\d{2}-\d{2}$/.test(a.w) && /^\d{4}-\d{2}-\d{2}$/.test(a.d) && typeof a.c === "string" && ["a", "p", "m"].includes(a.t)) {
      /* the person's notify doc must still exist (an account deleted since the reminder gets nothing written) */
      /* counts as being active today only if it is still that day (a tap the next morning mustn't move it back) */
      await db.setPaths(`notify/${a.u}`, a.d === today ? [[["last"], a.d], [["ign"], 0]] : [[["ign"], 0]], [], { mustExist: true });
      const path = `users/${a.u}/docs/${a.w}`, marker = [["_w"], `srv:0:${now}`];   // a fresh save marker, so the app merges this as a change from elsewhere
      for (let attempt = 0; attempt < 3; attempt++) {
        const got = await db.getMany([path], { times: true }), week = got[path], day = ((week || {}).days || {})[a.d] || {};
        if (a.t === "a" ? (day.a || {})[a.c] : (day.p || {})[a.c]) return reply(200, { ok: true, already: true, msg: `${a.n || "That"} was already ticked.` });
        const sets = [[["kind"], "week"], [["start"], a.w.slice(2)], [["days", a.d, a.t === "a" ? "a" : "p", a.c], true], marker];
        try {
          /* only if nobody changed the week since we looked: two taps at once can't count twice */
          await db.setPaths(path, sets, a.t === "p" ? [[["c", a.c], +a.s || 1]] : [], week ? { updateTime: week.__updateTime } : { missing: true });
        } catch (e) { if (/ (400|409) /.test(String(e.message)) && /FAILED_PRECONDITION|ALREADY_EXISTS|precondition/i.test(String(e.message))) continue; throw e; }
        /* monthly floors count in the month of the week's Monday, by one, like the app does */
        if (a.t === "m") await db.setPaths(`users/${a.u}/docs/settings`, [[["_w"], `srv:0:${now}`]], [[["months", monthKey(parse(a.w.slice(2))), "c", a.c], 1]]);
        return reply(200, { ok: true, msg: `${a.n || "Done"} ✓ Logged for today.` });
      }
      return reply(409, { ok: false, why: "busy, try again" });
    }
    return reply(400, { ok: false });
  } catch (e) {
    if (/ 404 /.test(String(e.message))) return reply(410, { ok: false, why: "gone" });
    return reply(502, { ok: false, why: "try again" });
  }
}

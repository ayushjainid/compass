// What's still open today, and signed one-tap actions for the evening reminder.
// Mirrors the app's Today list: daily floors (on their picked days), weekly floors planned for today,
// monthly floors dated today; paused floors and off-weeks are skipped, and a Minimum Viable Week keeps
// only the safety net.
import { parse, planDays, timeOn, onWeek, monthKey } from "../../public/shared/ics.js";
import { b64uEncode } from "./push.js";

export const weekId = mondayKey => "w-" + mondayKey;
const pausedOn = (c, mon) => (!!c.paused && mon >= c.paused) || (c.pauses || []).some(p => { const x = Array.isArray(p) ? { from: p[0], to: p[1] } : p || {}; return mon >= x.from && mon < x.to; });

/** Items due today that aren't ticked yet, earliest time first: [{ id, name, kind: "a" | "p", step }] */
export function openToday({ profile, settings, week }, day, mondayKey) {
  const comps = ((profile || {}).components || []).filter(c => c && !c.fun && !pausedOn(c, mondayKey) && onWeek(c, mondayKey));
  const mvw = week && week.mvw !== undefined ? !!week.mvw : !!(((settings || {}).preMvw || {})[weekId(mondayKey)]);
  const di = (parse(day).getDay() + 6) % 7, d = ((week || {}).days || {})[day] || {}, ticked = d.a || {}, done = d.p || {};
  const mplan = ((((settings || {}).months || {})[monthKey(parse(day))] || {}).plan) || {};
  const out = [], active = comps.filter(c => !mvw || c.mvw);
  for (const c of active) {
    if (c.cadence === "daily" && c.auto !== "journal" && (!planDays(c).length || planDays(c).includes(di)) && !ticked[c.id]) out.push({ id: c.id, name: c.name, kind: "a", t: planDays(c).includes(di) ? timeOn(c, di) : "" });
    else if (c.cadence === "weekly" && planDays(c).includes(di) && !done[c.id]) out.push({ id: c.id, name: c.name, kind: "p", t: timeOn(c, di), step: c.step || 1 });
  }
  return out.sort((x, y) => (x.t ? 0 : 1) - (y.t ? 0 : 1) || (x.t < y.t ? -1 : x.t > y.t ? 1 : 0)).map(({ t, ...x }) => x).concat(
    active.filter(c => c.cadence === "monthly" && mplan[c.id] && mplan[c.id].date === day && !(done[c.id])).map(c => ({ id: c.id, name: c.name, kind: "m", step: c.step || 1 })));
}

/** "Gym, Read and Journal" / "Gym, Read and 3 more" */
export function listNames(items, max = 3) {
  const names = items.map(i => i.name);
  if (names.length <= 1) return names[0] || "";
  if (names.length <= max) return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  return names.slice(0, max - 1).join(", ") + ` and ${names.length - (max - 1)} more`;
}

/* ---- signed action tokens: the notification's buttons carry these; only this Worker can make them ---- */
const enc = new TextEncoder();
async function hmacKey(env) {
  const secret = env.ACTION_SECRET || env.VAPID_PRIVATE;
  if (!secret) throw new Error("no signing secret");
  return crypto.subtle.importKey("raw", enc.encode("compass-actions:" + secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
const b64uBytes = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
export async function signAction(env, a) {
  const body = b64uEncode(enc.encode(JSON.stringify(a)));
  const sig = b64uEncode(new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(body))));
  return body + "." + sig;
}
export async function readAction(env, token, now = Date.now()) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig || body.length > 1500) return null;
  let good = false; try { good = await crypto.subtle.verify("HMAC", await hmacKey(env), b64uBytes(sig), enc.encode(body)); } catch (e) { return null; }
  if (!good) return null;
  let a; try { a = JSON.parse(new TextDecoder().decode(b64uBytes(body))); } catch (e) { return null; }
  if (!a || typeof a.u !== "string" || !(a.x > now)) return null;
  return a;
}

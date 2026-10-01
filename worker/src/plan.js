// What to send, and when. Pure functions: easy to test, no I/O.
import { localDay, localMonday, nextAt, validTz } from "./time.js";

export const STALE_MS = 2 * 3600e3;   // a reminder more than 2 h late is skipped, not sent
export const SLOW_AFTER = 3;           // ignored evening nudges before dropping to every other day
export const STOP_AFTER = 6;           // ignored evening nudges before evenings pause (Sunday review stays)

const EVENING = [
  ["How did today go?", "Tick what happened. It takes ten seconds."],
  ["Close the day", "Log what moved and let the rest go."],
  ["Quick check-in", "What held today? Compass keeps the tally."],
  ["Today, in a few taps", "Floors cleared count. Misses are just data."],
  ["Before you wind down", "Two minutes to mark today, then rest."],
  ["One look at today", "Tick the floors you held. One miss is noise."],
];
const REVIEW = [
  ["Your week in review", "About 25 minutes to see the trend and set next week."],
  ["Sunday review", "See which floors held and adjust one thing for next week."],
  ["Look back, then plan", "Your weekly review is ready when you are."],
];

function dayNumber(day) { return Math.floor(Date.parse(day + "T00:00:00Z") / 864e5); }
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
/** Rotates through the list so the same words never show twice in a row (novelty matters). */
export function pick(list, uid, n) { return list[(hash(uid) + n) % list.length]; }

/**
 * Decide for one `notify` document that is due for `kind` ("eve" or "rev").
 * Returns { send: payload|null, fields: {...to write back}, why }.
 */
export function decide(kind, uid, d, now) {
  const tz = validTz(d.tz) ? d.tz : "UTC";
  const fields = {}, today = localDay(tz, now);
  const dueAt = kind === "eve" ? d.nextEve : d.nextRev;
  // always move the schedule forward first, so a slow or overlapping run can never send twice
  const nx = kind === "eve" ? (d.on && d.eve ? nextAt(tz, d.eve, now) : null) : (d.on && d.rev ? nextAt(tz, d.rev, now, 6) : null);
  fields[kind === "eve" ? "nextEve" : "nextRev"] = nx ? new Date(nx) : null;
  const skip = why => ({ send: null, fields, why });
  if (!d.on || !d.sub || !d.sub.endpoint) return skip("off");
  if (dueAt && now - dueAt > STALE_MS) return skip("stale");
  if (kind === "eve") {
    if (!d.eve) return skip("off");
    if (d.last === today) return skip("active today");
    const ign = d.ign || 0;
    if (ign >= STOP_AFTER) return skip("paused after being ignored");
    if (ign >= SLOW_AFTER && d.sentDay === localDay(tz, now - 864e5)) return skip("every other day");
    fields.sentDay = today; fields.ign = ign + 1;
    const [title, body] = pick(EVENING, uid, dayNumber(today));
    return { send: { title, body, url: "/?from=checkin", tag: "compass-checkin" }, fields, why: "send" };
  }
  if (!d.rev) return skip("off");
  const monday = localMonday(tz, now);
  if (d.revDone === monday) return skip("review done");
  fields.sentRev = monday;
  const [title, body] = pick(REVIEW, uid, Math.floor(dayNumber(today) / 7));
  return { send: { title, body, url: "/?tab=review&from=review", tag: "compass-review" }, fields, why: "send" };
}

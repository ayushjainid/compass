// What to send, and when. Pure functions: easy to test, no I/O.
import { localDay, localMonday, nextAt, validTz } from "./time.js";

export const STALE_MS = 2 * 3600e3;   // a reminder more than 2 h late is skipped, not sent
export const SLOW_AFTER = 3;           // ignored evening nudges before dropping to every other day
export const STOP_AFTER = 6;           // ignored evening nudges before evenings pause (Sunday review stays)

// Light and warm, never guilt-trippy. Rotated so the same line never shows two evenings running.
const EVENING = [
  ["Your floors are waiting", "Not judging. Just waiting. Ten seconds to tick today."],
  ["Psst, it's your compass", "I can't point north if you don't tell me where you went today."],
  ["Day's almost done", "Tick what happened before it turns into \"what even happened\"."],
  ["Quick one", "Did today count? Spoiler: probably more than you think."],
  ["Your needle is spinning", "Two taps and it settles. Promise."],
  ["Tiny check-in, big vibes", "Log today faster than you can pick a show."],
  ["Knock knock", "Who's there? Today. Today who? Today, waiting to be ticked."],
  ["Floors, not ceilings", "Even one cleared floor is a win. Come claim it."],
  ["Before the couch wins", "A quick tick now, guilt-free scrolling after."],
  ["Hey, you did stuff today", "Probably. Let's find out together."],
  ["Compass here 🧭", "Recalibrating needs data. You are the data."],
  ["Evening, legend", "Ten seconds of ticking, then the night is all yours."],
];
// after a few ignored nights: softer, zero pressure
const COMEBACK = [
  ["No streak police here", "Missed a few days? Happens. Today's a clean page."],
  ["Still rooting for you", "One tap and you're back on the map."],
  ["The compass missed you", "No catching up needed. Just today."],
];
const REVIEW = [
  ["Sunday review o'clock", "Grab a tea. Let's see what the week actually looked like."],
  ["Your week: the director's cut", "25 minutes to watch the plot and plan the sequel."],
  ["Weekly debrief, captain", "What held, what slipped, one thing to tweak. That's it."],
  ["The week called", "It wants a quick review before it leaves forever."],
  ["Plot twist: you did more than you think", "Your Sunday review is ready to prove it."],
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
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
    const [title, body] = pick(ign >= SLOW_AFTER ? COMEBACK : EVENING, uid, dayNumber(today));
    return { send: { title, body, url: "/?from=checkin", tag: "compass-checkin" }, fields, why: "send" };
  }
  if (!d.rev) return skip("off");
  const monday = localMonday(tz, now);
  if (d.revDone === monday) return skip("review done");
  fields.sentRev = monday;
  const [title, body] = pick(REVIEW, uid, Math.floor(dayNumber(today) / 7));
  /* the first Sunday of a month also brings last month's look-back */
  const dom = +today.slice(8, 10), lastMonth = MONTHS[(+today.slice(5, 7) + 10) % 12];
  return { send: { title, body: dom <= 7 ? `${body}\nIf you logged in ${lastMonth}, its look-back is in the review too.` : body, url: "/?tab=review&from=review", tag: "compass-review" }, fields, why: "send" };
}

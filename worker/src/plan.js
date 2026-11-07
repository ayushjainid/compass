// What to send, and when. Pure functions: easy to test, no I/O.
import { localDay, localMonday, nextAt, validTz } from "./time.js";

export const STALE_MS = 2 * 3600e3;   // a reminder more than 2 h late is skipped, not sent
export const SLOW_AFTER = 3;           // ignored evening nudges before dropping to every other day
export const STOP_AFTER = 6;           // ignored evening nudges before evenings pause (Sunday review stays)

// Light and warm, never guilt-trippy. Rotated so the same line never shows two evenings running.
const EVENING = [
  ["Close the day", "A minute to mark what happened today."],
  ["How did today go?", "Swipe through today's floors. It takes about a minute."],
  ["Evening check-in", "Mark what happened, then add anything for tomorrow."],
  ["Before you wind down", "Take a minute to close the day."],
];
/* after a few ignored evenings: lighter, and no catching up */
const COMEBACK = [
  ["Just today", "No need to catch up. Mark today and leave the rest."],
  ["Whenever you're ready", "Today's a fresh page. A minute is enough."],
  ["A fresh start", "Skip the missed days. Close today in a minute."],
];
const REVIEW = [
  ["Sunday review", "What held this week, what slipped, and one thing to adjust."],
  ["Your week in review", "A few quiet minutes to look back and set up next week."],
  ["Time for your weekly review", "See how the week went and plan the next one."],
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
/** Where to send: every device in `subs` (one per device), or the single `sub` from before devices were kept apart. */
export function targets(d) {
  const out = [], seen = new Set();
  for (const [dev, s] of Object.entries((d && d.subs) || {})) if (s && s.endpoint && !seen.has(s.endpoint)) { seen.add(s.endpoint); out.push({ dev, label: s.dev || "", endpoint: s.endpoint, keys: s.keys }); }
  if (!out.length && d && d.sub && d.sub.endpoint) out.push({ dev: "", label: "", endpoint: d.sub.endpoint, keys: d.sub.keys });
  return out;
}

export function decide(kind, uid, d, now) {
  const tz = validTz(d.tz) ? d.tz : "UTC";
  if (kind === "test") {
    /* "Send a test" in the app: once, to every device, whatever the schedule says */
    const fields = { nextTest: null };
    if (!targets(d).length) return { send: null, fields, why: "test: no device" };
    return { send: { title: "Test reminder", body: "Reminders are working on this device.", url: "/?tab=compass&from=test", tag: "compass-test" }, fields, why: "test" };
  }
  if (kind === "morn") {
    /* the morning glance: today's floors, once a day at the chosen time */
    const today = localDay(tz, now), fields = { nextMorn: d.on && d.morn ? new Date(nextAt(tz, d.morn, now)) : null };
    if (!d.on || !d.morn || !targets(d).length) return { send: null, fields, why: "off" };
    if (d.nextMorn && now - d.nextMorn > STALE_MS) return { send: null, fields, why: "stale" };
    if (d.mornDay === today) return { send: null, fields, why: "sent today" };
    fields.mornDay = today;
    return { send: { title: "Today's floors", body: "", url: "/?tab=today&from=morning", tag: "compass-morning" }, fields, why: "send" };
  }
  const fields = {}, today = localDay(tz, now);
  const dueAt = kind === "eve" ? d.nextEve : d.nextRev;
  // always move the schedule forward first, so a slow or overlapping run can never send twice
  const nx = kind === "eve" ? (d.on && d.eve ? nextAt(tz, d.eve, now) : null) : (d.on && d.rev ? nextAt(tz, d.rev, now, 6) : null);
  fields[kind === "eve" ? "nextEve" : "nextRev"] = nx ? new Date(nx) : null;
  const skip = why => ({ send: null, fields, why });
  if (!d.on || !targets(d).length) return skip("off");
  if (dueAt && now - dueAt > STALE_MS) return skip("stale");
  if (kind === "eve") {
    if (!d.eve) return skip("off");
    if (d.ckDay === today) return skip("day closed");
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
  return { send: { title, body: dom <= 7 ? `${body}
Your ${lastMonth} look-back is ready too.` : body, url: "/?tab=review&from=review", tag: "compass-review" }, fields, why: "send" };
}

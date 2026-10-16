// Notes between people who share Compass: someone joined your list or became your watcher, gave you a task,
// or cheered you on (`pings/*`, written by the app), and a Sunday note to each watcher about the person they
// watch (`watch/*`.nextDigest). Pure functions here; index.js does the reading, claiming and sending.
import { localDay, localMonday, nextAt, partsIn, validTz } from "./time.js";
import { weekId } from "./today.js";

export const QUIET_FROM = 22, QUIET_TO = 8;   // no social notes between 10 pm and 8 am, the recipient's time
export const PER_HOUR = 6;                     // at most this many social notes per person per hour; more are dropped
export const DIGEST_AT = "18:00";               // Sunday, the watched person's time
export const STALE_DIGEST_MS = 6 * 3600e3;      // a digest more than 6 h late is skipped (the Worker was down)

const str = (x, n) => String(x == null ? "" : x).replace(/\s+/g, " ").trim().slice(0, n);
const first = n => str(n, 60).split(" ")[0] || "Someone";
const idOk = x => typeof x === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(x);

/** The instant quiet hours end, if it's quiet hours for `tz` at `now`; otherwise null. */
export function quietUntil(tz, now) {
  const z = validTz(tz) ? tz : "UTC", h = partsIn(z, now).h;
  if (h >= QUIET_FROM || h < QUIET_TO) return nextAt(z, pad(QUIET_TO) + ":00", now);
  return null;
}
const pad = n => String(n).padStart(2, "0");
export const hourKey = (tz, now) => { const z = validTz(tz) ? tz : "UTC"; return localDay(z, now) + "T" + pad(partsIn(z, now).h); };

/** What a ping says. Everything in it was typed by another person, so it's trimmed and never trusted as a link. */
export function pingText(p) {
  const who = first(p.n), ln = str(p.ln, 60), t = str(p.t, 100);
  if (p.k === "join" && p.w) return { title: `${who} is now your accountability partner`, body: "They'll see your week's summary and can cheer you on. You choose what they see in Compass.", url: "/?tab=compass&from=social", tag: "compass-join-watch" };
  if (p.k === "join") return { title: `${who} joined “${ln || "your list"}”`, body: "You can plan it together now.", url: idOk(p.l) ? `/?tab=tasks&list=${p.l}&from=social` : "/?tab=tasks&from=social", tag: "compass-join-" + (idOk(p.l) ? p.l : "list") };
  if (p.k === "assign") return { title: `${who} gave you a task`, body: `“${t || "A task"}”${ln ? ` in ${ln}` : ""}`, url: idOk(p.l) && idOk(p.i) ? `/?tab=tasks&list=${p.l}&item=${p.i}&from=social` : "/?tab=tasks&from=social", tag: "compass-assign-" + (idOk(p.i) ? p.i : "task") };
  if (p.k === "cheer") return { title: `${who} cheered you on`, body: str(p.x, 200) || "👏", url: "/?tab=today&from=cheer", tag: "compass-cheer" };
  return null;
}

/** The Sunday note to a watcher. `w` is the watched person's watch page; numbers in it are made numbers. */
export function digestText(owner, w, now) {
  const tz = validTz(w.tz) ? w.tz : "UTC", who = first(w.name), wk = w.week && typeof w.week === "object" ? w.week : null;
  const num = x => { const n = Number(x); return isFinite(n) ? Math.round(n * 10) / 10 : 0; };
  const url = idOk(owner) ? `/?tab=today&watch=${owner}&from=digest` : "/?tab=today&from=digest";
  const tag = "compass-digest-" + (idOk(owner) ? owner : "x");
  if (wk && wk.id === weekId(localMonday(tz, now))) {
    const total = num(wk.total), held = num(wk.held), vals = num(wk.vals), cleared = num(wk.cleared);
    const line = total ? `${held} of ${total} floors held${vals ? ` · ${cleared} of ${vals} values cleared` : ""}.` : "A week without floors.";
    return { title: `${who}'s week`, body: `${line}${wk.mvw ? " A lighter week, on purpose." : ""}\nA quick cheer goes a long way.`, url, tag };
  }
  return { title: `${who} has been quiet this week`, body: "No check-ins yet. A kind word might help them pick it back up.", url, tag };
}

/** When the next Sunday note is due for a watch page (its owner's 6 pm on Sunday). */
export const nextDigest = (w, now) => nextAt(validTz(w.tz) ? w.tz : "UTC", DIGEST_AT, now, 6);

// Local-time helpers that work in any IANA time zone, DST included.
// Shared logic: the web app has a copy of nextAt() so both sides agree on when a reminder is due.

const fmtCache = new Map();
function fmt(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    fmtCache.set(tz, f);
  }
  return f;
}

export function validTz(tz) {
  try { fmt(tz); return true; } catch (e) { return false; }
}

/** The wall-clock parts of instant `ms` in time zone `tz`. */
export function partsIn(tz, ms) {
  const o = {};
  for (const p of fmt(tz).formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = +p.value;
  return { y: o.year, m: o.month, d: o.day, h: o.hour % 24, mi: o.minute };
}

/** Minutes the zone is ahead of UTC at instant `ms`. */
function offsetMin(tz, ms) {
  const p = partsIn(tz, ms);
  return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - Math.floor(ms / 60000) * 60000) / 60000);
}

/** UTC instant of a local wall-clock time. */
export function localToUtc(tz, y, m, d, h, mi) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const off = offsetMin(tz, guess);
  let t = guess - off * 60000;
  const off2 = offsetMin(tz, t);
  if (off2 !== off) t = guess - off2 * 60000;
  return t;
}

const pad = n => String(n).padStart(2, "0");

/** "YYYY-MM-DD" for instant `ms` in `tz`. */
export function localDay(tz, ms) {
  const p = partsIn(tz, ms);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** Monday ("YYYY-MM-DD") of the local week containing `ms`. */
export function localMonday(tz, ms) {
  const p = partsIn(tz, ms);
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/**
 * Next instant strictly after `after` when the local clock in `tz` reads `hhmm`.
 * `dow` (0 = Monday … 6 = Sunday) limits it to one weekday; null means any day.
 */
export function nextAt(tz, hhmm, after, dow = null) {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, mi] = hhmm.split(":").map(Number);
  const p = partsIn(tz, after);
  for (let i = 0; i < 9; i++) {
    const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + i));
    if (dow !== null && (dt.getUTCDay() + 6) % 7 !== dow) continue;
    const t = localToUtc(tz, dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), h, mi);
    if (t > after) return t;
  }
  return null;
}

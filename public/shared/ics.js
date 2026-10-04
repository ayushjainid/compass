// A Compass plan as an iCalendar (.ics) file. Shared by the app (Download) and the reminders Worker
// (the live calendar feed), so both always produce the same events.
//
// Everything is computed in the person's wall-clock time: `today` is a Date whose local Y/M/D is their
// date, and event times are written as local times tagged with their time zone (TZID).
import { VALUE_LIB } from "./values.js";

const pad = n => String(n).padStart(2, "0");
export const dkey = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
export const parse = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const monday = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)); };
export const monthKey = (d = new Date()) => d.getFullYear() + "-" + pad(d.getMonth() + 1);
const RR = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export const everyN = c => (c && c.every > 1 ? Math.min(8, Math.round(c.every)) : 1);
export function onWeek(c, monKey) {
  const n = everyN(c); if (n === 1) return true;
  const k = Math.round((parse(monKey) - parse(c.from || monKey)) / (7 * 864e5));
  return k >= 0 && k % n === 0;
}
export const planDays = c => (c.block && Array.isArray(c.block.days)) ? c.block.days : [];
export const timeOn = (c, di) => (c.block && ((c.block.times || {})[di] ?? c.block.time)) || "";
export const durOf = c => (c.block && c.block.dur) || Math.max(15, Math.round((c.hours || 0.5) * 60));
const hFmt = h => { const r = Math.round(h * 100) / 100; return (r % 1 === 0 ? r.toFixed(0) : String(r)).replace(/^0\./, "0."); };
export const freqWords = c => c.unit ? `${hFmt(c.target)} h a week` : c.cadence === "daily" ? `${c.target} day${c.target > 1 ? "s" : ""} a week` : c.cadence === "monthly" ? `${c.target}× a month` : `${c.target}× a week`;
export const valueNameIn = profile => vid => (VALUE_LIB.find(v => v.id === vid) || ((profile || {}).customValues || []).find(v => v.id === vid) || { name: "Other" }).name;

export const icsEsc = t => String(t || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
const icsFold = line => { const out = []; let l = line; while (l.length > 74) { out.push(l.slice(0, 74)); l = " " + l.slice(74); } out.push(l); return out.join("\r\n"); };
const icsStamp = d => d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z";
const icsLocal = d => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "T" + pad(d.getHours()) + pad(d.getMinutes()) + "00";
const icsDay = d => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());

/**
 * @param {object} o
 * @param {object} o.profile   the person's profile doc (components, customValues)
 * @param {object} o.settings  their settings doc (months[ym].plan for monthly floors)
 * @param {Date}   o.today     a Date whose local date is their today
 * @param {Date}   [o.now]     the real current instant (DTSTAMP)
 * @param {string} [o.zone]    IANA time zone, e.g. "Asia/Kolkata"
 * @param {number} [o.alert]   minutes before a timed block for its alert; -1 for none
 * @param {"each"|"one"|"none"} [o.daily]  daily floors without a time: all-day each, one combined, or left out
 * @param {string} [o.name]    calendar name
 * @param {string} [o.refresh] suggested refresh interval for subscribed feeds (e.g. "PT6H")
 * @param {boolean} [o.notes] include floor notes (the private feed leaves them out)
 * @param {number} [o.weeksBack] start repeating events this many weeks back, so a subscribed calendar keeps recent history
 */
export function buildIcs({ profile, settings, today = new Date(), now = new Date(), zone = "", alert = 0, daily = "each", name = "Compass", refresh = "", notes = true, weeksBack = 0 }) {
  const comps = ((profile || {}).components || []).filter(c => c && !c.fun && !c.paused);
  const valName = valueNameIn(profile), start = addDays(monday(today), -7 * weeksBack), L = [];
  const push = (...xs) => xs.forEach(x => L.push(icsFold(x)));
  const alarm = nm => { if (alert < 0) return; push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc(nm), `TRIGGER:-PT${alert}M`, "END:VALARM"); };
  const tzid = zone ? ";TZID=" + zone : "";
  push("BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Compass//life-compass.web.app//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:" + icsEsc(name), zone ? "X-WR-TIMEZONE:" + zone : "");
  if (refresh) push("REFRESH-INTERVAL;VALUE=DURATION:" + refresh, "X-PUBLISHED-TTL:" + refresh);
  let n = 0;
  const dailyAll = comps.filter(c => c.cadence === "daily" && c.auto !== "journal");
  dailyAll.concat(comps.filter(c => c.cadence === "weekly")).forEach(c => {
    const days = planDays(c); if (!days.length) return;
    const groups = {}; days.forEach(d => { const t = timeOn(c, d); (groups[t] = groups[t] || []).push(d); });
    Object.entries(groups).forEach(([t, ds]) => {
      let first = null;
      for (let i = 0; i < 7 * 9 + 400 && !first; i++) { const d = addDays(start, i); if (ds.includes((d.getDay() + 6) % 7) && onWeek(c, dkey(monday(d)))) first = d; }
      if (!first) return;
      const rule = "RRULE:FREQ=WEEKLY;" + (everyN(c) > 1 ? `INTERVAL=${everyN(c)};` : "") + "BYDAY=" + ds.slice().sort().map(d => RR[d]).join(",");
      push("BEGIN:VEVENT", `UID:compass-${c.id}-${t.replace(":", "") || "any"}@life-compass.web.app`, "DTSTAMP:" + icsStamp(now));
      if (t) { const [h, m] = t.split(":").map(Number); const s0 = new Date(first); s0.setHours(h, m, 0, 0); const e0 = new Date(s0.getTime() + durOf(c) * 60000); push(`DTSTART${tzid}:${icsLocal(s0)}`, `DTEND${tzid}:${icsLocal(e0)}`); }
      else push("DTSTART;VALUE=DATE:" + icsDay(first), "DTEND;VALUE=DATE:" + icsDay(addDays(first, 1)), "TRANSP:TRANSPARENT");
      push(rule, "SUMMARY:" + icsEsc(c.name), "DESCRIPTION:" + icsEsc(`Compass · ${valName(c.value)}. ${freqWords(c)}. Hold it loosely.`)); if (t) alarm(c.name); push("END:VEVENT"); n++;
    });
  });
  /* daily floors with no days set: all-day events every day, one each or combined */
  const loose = dailyAll.filter(c => !planDays(c).length), d0 = addDays(new Date(today.getFullYear(), today.getMonth(), today.getDate()), -7 * weeksBack);
  const allDay = (uid, nm, desc) => { push("BEGIN:VEVENT", `UID:${uid}@life-compass.web.app`, "DTSTAMP:" + icsStamp(now), "DTSTART;VALUE=DATE:" + icsDay(d0), "DTEND;VALUE=DATE:" + icsDay(addDays(d0, 1)), "TRANSP:TRANSPARENT", "RRULE:FREQ=DAILY", "SUMMARY:" + icsEsc(nm), "DESCRIPTION:" + icsEsc(desc), "END:VEVENT"); n++; };
  if (loose.length && daily === "each") loose.forEach(c => allDay(`compass-${c.id}-daily`, c.name, `Compass · ${valName(c.value)}. ${freqWords(c)}, any time of day.${notes && c.note ? " " + c.note : ""}`));
  else if (loose.length && daily === "one") allDay("compass-daily-floors", "Daily floors", "Compass · any time today: " + loose.map(c => c.name).join(", ") + ".");
  const byId = id => comps.find(c => c.id === id);
  (weeksBack ? [monthKey(new Date(today.getFullYear(), today.getMonth() - 1, 1))] : []).concat([monthKey(today), monthKey(new Date(today.getFullYear(), today.getMonth() + 1, 1))]).forEach(ym => {
    const mp = (((settings || {}).months || {})[ym] || {}).plan || {};
    Object.entries(mp).forEach(([cid, pl]) => {
      const c = byId(cid); if (!c || !pl || !pl.date) return;
      const d = parse(pl.date);
      push("BEGIN:VEVENT", `UID:compass-${cid}-${pl.date}@life-compass.web.app`, "DTSTAMP:" + icsStamp(now));
      if (pl.time) { const [h, m] = pl.time.split(":").map(Number); d.setHours(h, m, 0, 0); push(`DTSTART${tzid}:${icsLocal(d)}`, `DTEND${tzid}:${icsLocal(new Date(d.getTime() + durOf(c) * 60000))}`); }
      else push("DTSTART;VALUE=DATE:" + icsDay(d), "DTEND;VALUE=DATE:" + icsDay(addDays(d, 1)), "TRANSP:TRANSPARENT");
      push("SUMMARY:" + icsEsc(c.name), "DESCRIPTION:" + icsEsc(`Compass · ${valName(c.value)}. Monthly floor.`)); if (pl.time) alarm(c.name); push("END:VEVENT"); n++;
    });
  });
  push("END:VCALENDAR");
  return { text: L.filter(x => x !== "").join("\r\n") + "\r\n", n };
}

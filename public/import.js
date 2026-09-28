/* Compass import: reads exports from Todoist, TickTick, Sunsama, calendars (.ics) and plain lists,
   entirely in the browser, and turns them into a head start for setup.
   Nothing here talks to a server. */

/* ================= reading files ================= */
const dec = new TextDecoder("utf-8");
const stripBom = t => t.replace(/^﻿/, "");

export async function readFiles(fileList) {
  const out = [];
  for (const f of fileList) {
    const name = f.name || "file";
    const buf = await f.arrayBuffer();
    if (/\.zip$/i.test(name) || isZip(buf)) {
      for (const e of await unzip(buf)) out.push(...parseText(e.name, e.text));
    } else out.push(...parseText(name, dec.decode(buf)));
  }
  return out;
}
export function readPasted(text) { return parseText("pasted list", text || ""); }

function isZip(buf) { const b = new Uint8Array(buf, 0, Math.min(4, buf.byteLength)); return b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4; }

async function inflate(bytes) {
  if (typeof DecompressionStream === "undefined") throw new Error("unzip-unsupported");
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
export async function unzip(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let e = buf.byteLength - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error("bad-zip");
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const files = [];
  for (let i = 0; i < n && p + 46 <= buf.byteLength; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + xl + cl;
    if (name.endsWith("/") || /(^|\/)(__MACOSX|\.)/.test(name) || !/\.(csv|ics|json|txt|md)$/i.test(name)) continue;
    const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    const raw = u8.subarray(start, start + csize);
    const data = method === 0 ? raw : method === 8 ? await inflate(raw) : null;
    if (data) files.push({ name: name.split("/").pop(), path: name, text: dec.decode(data) });
  }
  return files;
}

/* ---------- CSV ---------- */
export function csv(text) {
  const rows = []; let row = [], f = "", q = false;
  text = stripBom(text);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ""));
}

/* ---------- dates ---------- */
function parseDate(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return new Date(v > 1e12 ? v : v * 1000);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (m) {
    const [, y, mo, d, h, mi, se, z] = m;
    if (!h) return Object.assign(new Date(+y, +mo - 1, +d), { allDay: true });
    return z ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(se || 0))) : new Date(+y, +mo - 1, +d, +h, +mi, +(se || 0));
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return Object.assign(new Date(+m[1], +m[2] - 1, +m[3]), { allDay: true });
  const t = Date.parse(s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2").replace(" ", "T"));
  if (!isNaN(t)) return new Date(t);
  const t2 = Date.parse(s);
  return isNaN(t2) ? null : new Date(t2);
}
const hhmm = d => d && !d.allDay ? String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") : null;
const di = d => (d.getDay() + 6) % 7; /* 0 = Monday */
const RR = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

/* ---------- repeats ---------- */
function rrule(s) {
  if (!s) return null;
  const line = String(s).split(/\r?\n/).find(l => /FREQ=/i.test(l)); if (!line) return null;
  const o = {}; line.replace(/^RRULE:/i, "").split(";").forEach(kv => { const [k, v] = kv.split("="); if (k && v) o[k.toUpperCase()] = v.toUpperCase(); });
  const freq = { DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly", YEARLY: "yearly" }[o.FREQ]; if (!freq) return null;
  const days = o.BYDAY ? o.BYDAY.split(",").map(x => RR.indexOf(x.replace(/^[+-]?\d+/, ""))).filter(x => x >= 0) : [];
  return { freq, n: Math.max(1, +(o.INTERVAL || 1)), days: [...new Set(days)].sort(), until: o.UNTIL ? parseDate(o.UNTIL) : null, count: o.COUNT ? +o.COUNT : null };
}
const DAYW = { mon: 0, monday: 0, tue: 1, tues: 1, tuesday: 1, wed: 2, wednesday: 2, thu: 3, thur: 3, thurs: 3, thursday: 3, fri: 4, friday: 4, sat: 5, saturday: 5, sun: 6, sunday: 6 };
/* Todoist-style natural language: "every mon, thu at 7am", "every other week", "daily", "every weekday" */
function natural(s) {
  if (!s) return null; s = String(s).toLowerCase().replace(/!/g, "");
  if (!/\b(every|daily|weekly|monthly|yearly|annually|weekdays?)\b/.test(s)) return null;
  const t = (() => { const m = s.match(/\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\bat\s*(\d{1,2}):(\d{2})\b/); if (!m) return null;
    let h = +(m[1] || m[4]), mi = +(m[2] || m[5] || 0); if (m[3] === "pm" && h < 12) h += 12; if (m[3] === "am" && h === 12) h = 0; return h < 24 ? String(h).padStart(2, "0") + ":" + String(mi).padStart(2, "0") : null; })();
  let n = 1; const nm = s.match(/every\s+(other|\d+)\s+(day|week|month|year)/); if (nm) n = nm[1] === "other" ? 2 : +nm[1];
  const days = [...new Set((s.match(/\b(mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(r(s(day)?)?)?|fri(day)?|sat(urday)?|sun(day)?)\b/g) || []).map(w => DAYW[w]).filter(x => x != null))].sort();
  let freq = null;
  if (/weekday|work ?day/.test(s)) return { freq: "weekly", n: 1, days: [0, 1, 2, 3, 4], time: t };
  if (/weekend/.test(s)) return { freq: "weekly", n: 1, days: [5, 6], time: t };
  if (/\b(year|yearly|annually)\b/.test(s) || /every\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/.test(s)) freq = "yearly";
  else if (/\b(months?|monthly)\b/.test(s) || /every\s+\d+(st|nd|rd|th)\b/.test(s) || /every\s+(first|last|second|third)\b/.test(s)) freq = "monthly";
  else if (days.length || /\b(weeks?|weekly)\b/.test(s)) freq = "weekly";
  else if (/\b(days?|daily|morning|evening|night)\b/.test(s) || /every\s+\d+\s+hours?/.test(s)) freq = "daily";
  if (!freq) return null;
  return { freq, n, days, time: t };
}

/* ---------- durations ---------- */
function minutes(v, hint = "") {
  if (v == null || v === "") return null;
  if (typeof v === "number") return /sec/i.test(hint) || v >= 1000 ? Math.round(v / (v > 1e5 ? 60000 : 60)) : /hour|hr/i.test(hint) ? Math.round(v * 60) : Math.round(v);
  const s = String(v).trim().toLowerCase();
  let m = s.match(/^(\d+):(\d{2})(?::\d{2})?$/); if (m) return +m[1] * 60 + +m[2];
  m = s.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?$/);
  if (m && (m[1] || m[2])) return Math.round((+m[1] || 0) * 60 + (+m[2] || 0));
  const n = parseFloat(s); return isNaN(n) ? null : minutes(n, hint);
}

/* ================= source parsers ================= */
const item = o => Object.assign({ title: "", notes: "", list: "", tags: [], due: null, start: null, dur: null, done: false, doneAt: null, created: null, repeat: null, time: null, kind: "task", src: "list" }, o);

function parseText(name, text) {
  text = stripBom(text || "");
  const low = name.toLowerCase();
  try {
    if (/\.ics$/.test(low) || /^BEGIN:VCALENDAR/m.test(text.slice(0, 400))) return ics(text, name);
    if (/\.json$/.test(low) || /^\s*[\[{]/.test(text)) { try { return fromJson(JSON.parse(text), name); } catch (e) { if (/\.json$/.test(low)) return []; } }
    if (/\.csv$/.test(low) || looksCsv(text)) return fromCsv(text, name);
  } catch (e) { console.warn("import: could not read", name, e); return []; }
  return plain(text);
}
function looksCsv(t) { const l = t.split(/\r?\n/).slice(0, 12).filter(Boolean); return l.length > 1 && l.filter(x => x.includes(",")).length >= Math.min(3, l.length); }

function plain(text) {
  return text.split(/\r?\n/).map(l => l.replace(/^\s*(?:(?:[-*•·–]|\d+[.)]|\[[ xX]?\]|☐|☑)\s*)+/, "").trim()).filter(l => l.length > 1 && l.length < 200)
    .map(l => { const r = natural(l); return item({ title: l.replace(/\s*[\(\[]?(every|daily|weekly|monthly)\b.*$/i, "").trim() || l, repeat: r, time: r && r.time, src: "list" }); });
}

function ics(text, name) {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const out = []; let cur = null, calName = "";
  for (const ln of lines) {
    if (/^BEGIN:(VEVENT|VTODO)/.test(ln)) { cur = { kind: ln.includes("VTODO") ? "task" : "event" }; continue; }
    if (/^END:(VEVENT|VTODO)/.test(ln)) {
      if (cur && cur.SUMMARY) {
        const s = parseDate(cur.DTSTART), e = parseDate(cur.DTEND) || parseDate(cur.DUE);
        let dur = s && e && !s.allDay ? Math.round((e - s) / 60000) : null;
        if (!dur && cur.DURATION) { const m = cur.DURATION.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/); if (m) dur = (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0); }
        const r = rrule(cur.RRULE);
        if (!/^(cancelled)$/i.test(cur.STATUS || "")) out.push(item({
          title: unesc(cur.SUMMARY), notes: unesc(cur.DESCRIPTION || "").slice(0, 300), list: calName || name.replace(/\.ics$/i, ""), kind: cur.kind,
          start: s, due: parseDate(cur.DUE) || null, dur: dur && dur < 16 * 60 ? dur : null, repeat: r && Object.assign(r, { days: r.days.length ? r.days : (r.freq === "weekly" && s ? [di(s)] : []) }),
          time: hhmm(s), done: cur.kind === "task" ? /COMPLETED/i.test(cur.STATUS || "") || !!cur.COMPLETED : false, doneAt: parseDate(cur.COMPLETED), src: "calendar",
          allDay: !!(s && s.allDay), transp: /TRANSPARENT/.test(cur.TRANSP || ""),
        }));
      }
      cur = null; continue;
    }
    const m = ln.match(/^([A-Z-]+)(;[^:]*)?:(.*)$/); if (!m) continue;
    if (!cur) { if (m[1] === "X-WR-CALNAME") calName = unesc(m[3]); continue; }
    if (!(m[1] in cur)) cur[m[1]] = m[3];
  }
  return out;
}
const unesc = s => String(s || "").replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();

function fromCsv(text, name) {
  let rows = csv(text); if (!rows.length) return [];
  const low = r => r.map(x => x.trim().toLowerCase());
  /* TickTick: a few preamble lines, then a header with "List Name" and "Title" */
  const tt = rows.findIndex(r => { const l = low(r); return l.includes("title") && (l.includes("list name") || l.includes("folder name")); });
  if (tt >= 0 && tt < 15) return ticktick(rows.slice(tt));
  const h0 = low(rows[0]);
  if (h0[0] === "type" && h0.includes("content")) return todoist(rows, name);
  return generic(rows, name);
}
const rowObj = (hdr, r) => Object.fromEntries(hdr.map((h, i) => [h, (r[i] ?? "").trim()]));

function ticktick(rows) {
  const hdr = rows[0].map(h => h.trim()), out = [];
  for (const r of rows.slice(1)) {
    const o = rowObj(hdr, r); if (!o.Title || /^note$/i.test(o.Kind || "")) continue;
    const s = parseDate(o["Start Date"]), due = parseDate(o["Due Date"]), allDay = /true/i.test(o["Is All Day"] || "");
    const rep = rrule(o.Repeat);
    let dur = s && due && !allDay ? Math.round((due - s) / 60000) : null; if (dur != null && (dur <= 0 || dur > 8 * 60)) dur = null;
    const at = s || due;
    out.push(item({
      title: o.Title, notes: (o.Content || "").slice(0, 300), list: o["List Name"] || "", folder: o["Folder Name"] || "", tags: (o.Tags || "").split(/[,;]/).map(x => x.trim()).filter(Boolean),
      start: at, due, dur, done: o.Status === "1" || o.Status === "2", doneAt: parseDate(o["Completed Time"]), created: parseDate(o["Created Time"]),
      repeat: rep && Object.assign(rep, { days: rep.days.length ? rep.days : (rep.freq === "weekly" && at ? [di(at)] : []) }), time: allDay ? null : hhmm(at), src: "ticktick",
    }));
  }
  return out;
}

function todoist(rows, name) {
  const hdr = rows[0].map(h => h.trim().toUpperCase()), out = [];
  const project = name.replace(/\.csv$/i, "").replace(/\s*\[\d+\]\s*$/, "").replace(/^.*\//, "");
  let section = "";
  for (const r of rows.slice(1)) {
    const o = rowObj(hdr, r);
    if (/^section$/i.test(o.TYPE)) { section = o.CONTENT; continue; }
    if (!/^task$/i.test(o.TYPE) || !o.CONTENT) continue;
    const tags = (o.CONTENT.match(/@[\w-]+/g) || []).map(x => x.slice(1));
    const title = o.CONTENT.replace(/@[\w-]+/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*/g, "").trim();
    const rep = natural(o.DATE);
    const due = rep ? null : parseDate(o.DATE);
    const dur = o.DURATION ? minutes(+o.DURATION * (/day/i.test(o.DURATION_UNIT) ? 1440 : 1)) : null;
    out.push(item({ title, notes: (o.DESCRIPTION || "").slice(0, 300), list: project, section, tags, due, dur: dur && dur < 8 * 60 ? dur : null, repeat: rep, time: rep ? rep.time : null, prio: +o.PRIORITY || 0, src: "todoist" }));
  }
  return out;
}

const SYN = {
  title: ["title", "name", "task", "task name", "text", "content", "summary", "subject", "description"],
  notes: ["notes", "note", "details", "body", "description"],
  list: ["list", "project", "channel", "context", "folder", "area", "category", "stream", "project name", "list name", "channel name", "board"],
  tags: ["tags", "labels", "label", "tag"],
  due: ["due", "due date", "deadline", "due_date", "duedate"],
  start: ["date", "scheduled", "scheduled date", "planned date", "day", "start", "start date", "start time", "when", "task date", "scheduleddate"],
  done: ["done", "completed", "complete", "is completed", "status", "state", "checked"],
  doneAt: ["completed at", "completed date", "completed on", "date completed", "completion date", "completed time", "completeddate", "done at", "completedat", "completion"],
  created: ["created", "created at", "created date", "date created", "createdat", "added"],
  dur: ["time estimate", "timeestimate", "planned time", "estimate", "estimated time", "duration", "actual time", "time spent", "time", "minutes"],
  repeat: ["repeat", "recurrence", "recurring", "rrule", "repeats", "repeat rule"],
};
function pickCols(headers) {
  const L = headers.map(h => h.trim().toLowerCase()), map = {};
  for (const [k, names] of Object.entries(SYN)) {
    let i = -1; for (const n of names) { i = L.indexOf(n); if (i >= 0) break; }
    if (i < 0) i = L.findIndex(h => names.some(n => n.length > 4 && h.includes(n)));
    if (i >= 0 && !Object.values(map).includes(i)) map[k] = i;
  }
  return { map, hints: L };
}
function srcFromName(name) { return /sunsama/i.test(name) ? "sunsama" : /todoist/i.test(name) ? "todoist" : /ticktick/i.test(name) ? "ticktick" : "csv"; }
function truthy(v) { const s = String(v ?? "").trim().toLowerCase(); return ["true", "yes", "y", "1", "x", "done", "completed", "complete", "checked", "closed"].includes(s); }
function generic(rows, name) {
  const { map, hints } = pickCols(rows[0]); if (map.title == null) return rows.map(r => item({ title: r[0] })).filter(x => x.title).slice(1);
  const src = srcFromName(name), out = [];
  for (const r of rows.slice(1)) {
    const g = k => map[k] != null ? (r[map[k]] ?? "").trim() : "";
    const title = g("title"); if (!title) continue;
    const s = parseDate(g("start")), doneAt = parseDate(g("doneAt"));
    const rep = rrule(g("repeat")) || natural(g("repeat"));
    out.push(item({ title, notes: g("notes").slice(0, 300), list: g("list"), tags: g("tags").split(/[,;]/).map(x => x.trim()).filter(Boolean), start: s, due: parseDate(g("due")), dur: minutes(g("dur"), map.dur != null ? hints[map.dur] : ""),
      done: truthy(g("done")) || !!doneAt, doneAt, created: parseDate(g("created")), repeat: rep, time: (rep && rep.time) || hhmm(s), src }));
  }
  return out;
}

/* JSON: find arrays of task-like objects anywhere (Sunsama and other exports) */
const JK = {
  title: ["title", "text", "name", "content", "summary", "task"],
  notes: ["notes", "note", "description", "body"],
  list: ["channel", "channelName", "project", "projectName", "list", "listName", "context", "stream", "streamName", "area", "folder"],
  start: ["scheduledDate", "date", "day", "plannedDate", "startDate", "start", "scheduled", "taskDate"],
  due: ["dueDate", "due", "deadline"],
  done: ["completed", "done", "isCompleted", "complete", "checked"],
  doneAt: ["completedAt", "completeDate", "completedDate", "completed_at", "doneAt", "completionDate"],
  created: ["createdAt", "created", "created_at", "createdDate"],
  dur: ["timeEstimate", "plannedTime", "estimate", "duration", "actualTime", "timeSpent"],
  repeat: ["recurrence", "repeat", "rrule", "recurrenceRule", "recurring"],
};
function fromJson(data, name) {
  const src = srcFromName(name) === "csv" ? (JSON.stringify(data).slice(0, 4000).match(/sunsama|channel|timeEstimate|streamIds/i) ? "sunsama" : "json") : srcFromName(name);
  const out = [], seen = new Set();
  const val = (o, keys) => { for (const k of keys) { if (o[k] != null && o[k] !== "") return o[k]; } return null; };
  const walk = (x, depth) => {
    if (!x || depth > 6 || seen.has(x)) return; if (typeof x !== "object") return; seen.add(x);
    if (Array.isArray(x)) {
      const objs = x.filter(o => o && typeof o === "object" && !Array.isArray(o));
      if (objs.length && objs.filter(o => typeof val(o, JK.title) === "string").length >= objs.length * 0.6) {
        for (const o of objs) {
          const title = val(o, JK.title); if (typeof title !== "string" || !title.trim()) continue;
          const lst = val(o, JK.list), rep = val(o, JK.repeat), dv = val(o, JK.done), dk = JK.dur.find(k => o[k] != null);
          const listName = typeof lst === "string" ? lst : lst && typeof lst === "object" ? (lst.name || lst.title || "") : "";
          const r = typeof rep === "string" ? (rrule(rep) || natural(rep)) : rep && typeof rep === "object" ? (rrule(rep.rrule || rep.rule || "") || natural(rep.text || rep.description || rep.frequency || "")) : null;
          const s = parseDate(val(o, JK.start)), doneAt = parseDate(val(o, JK.doneAt));
          out.push(item({ title: title.trim(), notes: String(val(o, JK.notes) || "").slice(0, 300), list: listName, start: s, due: parseDate(val(o, JK.due)), dur: dk ? minutes(o[dk], dk) : null,
            done: dv === true || (typeof dv === "string" && truthy(dv)) || !!doneAt, doneAt, created: parseDate(val(o, JK.created)), repeat: r, time: (r && r.time) || hhmm(s), src,
            tags: Array.isArray(o.tags) ? o.tags.map(t => typeof t === "string" ? t : t && t.name).filter(Boolean) : [] }));
          (o.subtasks || o.children || []).forEach && walk(o.subtasks || o.children, depth + 1);
        }
        return;
      }
      x.forEach(v => walk(v, depth + 1)); return;
    }
    Object.values(x).forEach(v => walk(v, depth + 1));
  };
  walk(data, 0);
  return out;
}

/* ================= understanding ================= */
const W = (re, w = 1) => ({ re, w });
const LEX = {
  body: [W(/\b(gym|work ?out|lift(ing)?|weights|strength|crossfit|hiit|yoga|pilates|run(ning)?|jog(ging)?|5k|10k|marathon|swim(ming)?|cycl(e|ing)|bike ride|spin class|peloton|hike|hiking|stretch(ing)?|exercise|training|cardio|push-?ups|squats|steps)\b/, 3),
    W(/\b(tennis|badminton|squash|pickleball|football|soccer|basketball|volleyball|cricket|golf|climb(ing)?|boulder(ing)?|martial arts|boxing|dance class)\b/, 3),
    W(/\b(walk|sleep|bed ?time|in bed by|lights out|doctor|dentist|physio|check-?up|meal prep|protein|vitamins?|supplements|skin ?care|water intake|hydrate)\b/, 2)],
  mind: [W(/\b(meditat\w*|mindful\w*|journal(ing)?|therap(y|ist)|counsel(l?ing|or)|breath(work|ing)|gratitude|reflect(ion)?|headspace|calm app|mental health|self-?care)\b/, 3), W(/\b(no phone|screen time|digital detox|social media)\b/, 2)],
  rel: [W(/\b(mom|mum|dad|mother|father|parents?|grand(ma|pa|mother|father|parents)|sister|brother|sibling|family|aunt|uncle|cousin|nephew|niece)\b/, 3),
    W(/\b(call|text|facetime|visit|catch ?up|hang ?out|date night|dinner with|lunch with|coffee with|drinks with|brunch with|birthday|anniversary|wedding|gift for|friends?|partner|wife|husband|girlfriend|boyfriend|kids?|son|daughter)\b/, 2)],
  solve: [W(/\b(deep work|focus (block|time|session)|side project|ship|launch|deploy|code|coding|program(ming)?|leetcode|pull request|pr review|design doc|spec|prototype|research|analysis|write-?up|proposal|pitch|portfolio|resume|cv|job (search|application|hunt)|interview prep|apply to|career|promotion|okr|roadmap|startup)\b/, 3),
    W(/\b(project|report|presentation|deck|client|draft|finish|review|plan)\b/, 1)],
  create: [W(/\b(guitar|piano|violin|drums?|ukulele|sing(ing)?|song|compose|music production|produce|dj(ing)?|paint(ing)?|draw(ing)?|sketch(ing)?|illustrat\w*|photograph\w*|photo walk|film|video edit\w*|blog( post)?|newsletter|write|writing|novel|poem|poetry|story|pottery|ceramics|knit(ting)?|sew(ing)?|craft|woodwork\w*|cook(ing)? something new|bake)\b/, 3)],
  serve: [W(/\b(volunteer\w*|ngo|charity|donat\w*|food bank|shelter|mentor(ing)?|tutor(ing)?|community|fundrais\w*|church service|help (a |my )?neighbou?r|clean-?up drive)\b/, 3)],
  money: [W(/\b(budget\w*|bills?|pay (rent|the|credit)|rent|tax(es)?|invoice|savings?|invest\w*|401k|ira|roth|stocks?|portfolio|bank|splitwise|monarch|ynab|mint|expenses?|credit card|insurance|financ\w*|net worth|subscriptions?|refund|reimburse\w*|payroll|mortgage|loan)\b/, 3)],
  world: [W(/\b(trip|travel\w*|flight|book (a )?hotel|airbnb|visa|passport|vacation|holiday|getaway|road trip|explore|museum|gallery|festival|national park|new restaurant|weekend away|itinerary)\b/, 3)],
  learn: [W(/\b(read(ing)?|book club|course|class|study|studying|lesson|learn\w*|duolingo|language|spanish|french|german|japanese|mandarin|hindi|tutorial|lecture|udemy|coursera|homework|exam|certification|podcast|kindle|chapter|anki|flashcards)\b/, 3)],
  time: [W(/\b(rest|nap|day off|me time|free time|do nothing|relax(ation)?|recharge|unplug|sabbath|self day|lazy (day|sunday)|protected time)\b/, 3)],
};
const FUNLEX = [[/\bconcert|gig|live music|festival\b/, "Concert or live music"], [/\bmovie|cinema|film night|netflix\b/, "Movie night"], [/\bgame night|board ?games?|gaming|video games?\b/, "Game night"], [/\balbum|vinyl|listen to\b/, "Listen to an album properly"], [/\bcook something|new recipe|bake\b/, "Cook something new"], [/\bphoto walk|photograph/, "Photography walk"], [/\bsketch|doodle\b/, "Sketching"], [/\bread for fun|novel|fiction\b/, "Read for pleasure"]];
const WORKLEX = /\b(meeting|standup|stand-up|sync|1:1|one[- ]on[- ]one|interview|sprint|retro|planning|all[- ]hands|office|client|review|workshop|demo|call with|onsite|kickoff|kick-off|townhall|town hall|oncall|on-call|shift)\b/;
const CARELEX = /\b(pick ?up|drop ?off|daycare|nursery|school run|nanny|babysit\w*|pediatric\w*|kids'? (practice|class)|feed the baby)\b/;
const CHORE = /\b(groceries|grocery|laundry|clean(ing)?|dishes|vacuum|mop|trash|bins|pick up|drop off|return|order|buy|fix|repair|renew|cancel|schedule|book|email|reply|print|sign|submit|pay)\b/;
const GENERIC_LIST = /^(inbox|personal|work|tasks?|to-?do|todos?|default|welcome|getting started|reminders?|my list|list|home|misc|other|general|backlog|someday|calendar|events?|holidays in .*|birthdays|contacts|.*@.*)$/i;

/* Compass library matches: map a recurring habit to an existing suggestion so it enriches it instead of duplicating */
const LIBMAP = [
  ["gym", /\b(gym|work ?out|lift(ing)?|weights|strength|crossfit|hiit|peloton|spin class|run(ning)?|jog(ging)?|swim(ming)?|cardio|exercise)\b/],
  ["sports", /\b(tennis|badminton|squash|pickleball|football|soccer|basketball|volleyball|cricket|golf|climb(ing)?|boulder(ing)?|martial arts|boxing)\b/],
  ["walk", /\bwalk\b/], ["sleep", /\b(sleep|bed ?time|in bed by|lights out)\b/],
  ["med", /\bmeditat|headspace|mindful/], ["journal", /\bjournal/], ["therapy", /\btherap|counsel/],
  ["social", /\b(social media|screen time|no phone|instagram|tiktok|twitter|doomscroll)\b/],
  ["reach", /\b(call|text|facetime|message)\b.*\b(mom|mum|dad|parents?|family|grand\w*|sister|brother)\b|\b(mom|mum|dad|parents)\b.*\bcall\b/],
  ["queue", /\b(catch ?up call|call a friend|reach out|check in with)\b/],
  ["quality", /\b(date night|dinner with|lunch with|coffee with|hang ?out|family time|quality time)\b/],
  ["deep", /\b(deep work|focus (block|time|session))\b/], ["win", /\b(ship|launch|side project)\b/],
  ["practice", /\b(guitar|piano|violin|drums?|ukulele|sing(ing)?|instrument)\b/], ["creative", /\b(paint|draw|sketch|write|writing|blog|compose|music production|dj|pottery|craft|photograph)/],
  ["read", /\bread(ing)?\b/], ["course", /\b(course|class|study|lesson|duolingo|language|udemy|coursera|homework|anki)\b/],
  ["ngo", /\b(volunteer|ngo|food bank|shelter|charity)\b/], ["kind", /\b(kind act|help (a|my) neighbou?r|donat)/],
  ["lifeTax", /\b(budget|bills|expenses|splitwise|ynab|monarch|finances?|money check)\b/], ["autosave", /\b(savings|invest|401k|ira|portfolio)\b/],
  ["trip", /\b(trip|travel|flight|vacation|getaway)\b/], ["novelty", /\b(museum|explore|new restaurant|festival|gallery)\b/],
  ["recovery", /\b(rest|day off|me time|recharge|unplug|do nothing)\b/],
];
const libFor = t => (LIBMAP.find(([, re]) => re.test(t)) || [])[0] || null;

export const norm = t => String(t || "").toLowerCase().replace(/https?:\S+/g, "").replace(/[\u{1F000}-\u{1FFFF}☀-➿]/gu, "").replace(/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/g, "")
  .replace(/\b(\d+|mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?|sun(day)?|today|tomorrow|morning|evening|daily|weekly)\b/g, "").replace(/[^\p{L}\s&]/gu, " ").replace(/\s+/g, " ").trim();

function classify(it) {
  const t = (it.title + " " + (it.tags || []).join(" ")).toLowerCase(), l = ((it.list || "") + " " + (it.folder || "") + " " + (it.section || "")).toLowerCase();
  const sc = {};
  for (const [v, rules] of Object.entries(LEX)) {
    let s = 0; for (const r of rules) { if (r.re.test(t)) s += r.w; if (l && !GENERIC_LIST.test(it.list || "") && r.re.test(l)) s += r.w * 0.6; }
    if (s) sc[v] = s;
  }
  /* list-name hints for common list names */
  if (/fitness|health|gym|workout|sport/.test(l)) sc.body = (sc.body || 0) + 2;
  if (/family|friends|people|social|relationship/.test(l)) sc.rel = (sc.rel || 0) + 2;
  if (/finance|money|budget|bills/.test(l)) sc.money = (sc.money || 0) + 2;
  if (/learn|study|school|course|reading|books/.test(l)) sc.learn = (sc.learn || 0) + 2;
  if (/career|job|side project|startup|work projects?/.test(l)) sc.solve = (sc.solve || 0) + 2;
  if (/creative|music|art|writing|hobby|hobbies/.test(l)) sc.create = (sc.create || 0) + 2;
  if (/travel|trips?/.test(l)) sc.world = (sc.world || 0) + 2;
  if (/volunteer|community|charity/.test(l)) sc.serve = (sc.serve || 0) + 2;
  if (/mental|self-?care|mind/.test(l)) sc.mind = (sc.mind || 0) + 2;
  const best = Object.entries(sc).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 2 ? best[0] : null;
}
const isWork = it => WORKLEX.test(it.title.toLowerCase()) || /\bwork\b|office|team\b/.test((it.list || "").toLowerCase());

/* ================= analysis ================= */
const WEEK = 7 * 864e5;
const mondayOf = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - di(x)); return x; };
const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const roundTo = (m, step) => Math.max(step, Math.round(m / step) * step);
const tmin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const tstr = m => String(Math.floor(m / 60) % 24).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const DAYN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
const cleanName = t => cap1(String(t).replace(/\s*[\(\[][^)\]]*[\)\]]\s*$/, "").replace(/\s+/g, " ").trim()).slice(0, 60);
/* floors, not ceilings: start a little below what the apps asked for */
const floorOf = n => n <= 2 ? n : Math.max(1, Math.round(n * 0.75));
const SRC_NAME = { todoist: "Todoist", ticktick: "TickTick", sunsama: "Sunsama", calendar: "Calendar", csv: "CSV", json: "JSON", list: "Pasted list" };

export function analyze(items, ctx) {
  const now = ctx.now ? new Date(ctx.now) : new Date(), H = ctx.VALUE_LIB, LIB = ctx.COMP_LIB;
  const vname = id => (H.find(v => v.id === id) || {}).name || id;
  items = items.filter(it => it.title && it.title.length < 300 && !/^(untitled|new task|-)$/i.test(it.title.trim()));
  items.forEach(it => { it.v = classify(it); it.key = norm(it.title); it.when = it.doneAt || it.start || it.due || null; });
  const sources = {}; items.forEach(it => sources[it.src] = (sources[it.src] || 0) + 1);
  const since = new Date(now - 26 * WEEK), recent = it => it.when && it.when >= since && it.when <= now;

  /* ---- 1. recurring habits: explicit repeats, repeated completions, recurring events ---- */
  const groups = new Map();
  const g = key => { if (!groups.has(key)) groups.set(key, { key, items: [], rep: null, occ: [], times: [], days: [], durs: [], src: new Set(), titles: {} }); return groups.get(key); };
  for (const it of items) {
    if (!it.key || it.key.length < 2) continue;
    if (it.repeat && it.repeat.freq !== "yearly" && !(it.repeat.until && it.repeat.until < now)) { const x = g(it.key); x.rep = x.rep && x.rep.src === "calendar" && it.src !== "calendar" ? x.rep : Object.assign({}, it.repeat, { src: it.src }); x.items.push(it); if (it.time) x.times.push(tmin(it.time)); if (it.dur) x.durs.push(it.dur); x.src.add(it.src); x.titles[it.title] = (x.titles[it.title] || 0) + 1; if (it.start) x.first = it.start; }
    else if ((it.done || (it.kind === "event" && it.when && it.when <= now)) && recent(it)) { const x = g(it.key); x.occ.push(it.when); x.items.push(it); if (it.time) x.times.push(tmin(it.time)); x.days.push(di(it.when)); if (it.dur) x.durs.push(it.dur); x.src.add(it.src); x.titles[it.title] = (x.titles[it.title] || 0) + 1; }
  }
  const habits = [];
  for (const x of groups.values()) {
    const sample = x.items[0]; if (!sample) continue;
    const title = Object.entries(x.titles).sort((a, b) => b[1] - a[1])[0][0];
    const vc = {}; x.items.forEach(i => { if (i.v) vc[i.v] = (vc[i.v] || 0) + 1; });
    const v = (Object.entries(vc).sort((a, b) => b[1] - a[1])[0] || [])[0] || classify({ title, list: sample.list });
    if (!x.rep && sample.kind === "event" && isWork(sample) && !v) continue;
    const weeks = new Set(x.occ.map(d => +mondayOf(d)));
    const spanW = x.occ.length ? Math.max(1, Math.min(26, Math.ceil((now - Math.min(...x.occ)) / WEEK))) : 0;
    const actual = x.occ.length ? x.occ.length / Math.max(4, spanW) : null; /* per week */
    let cadence, target, days = [], why, planned = null;
    if (x.rep) {
      const r = x.rep;
      if (r.freq === "daily") { planned = r.n === 1 ? 7 : Math.max(1, Math.round(7 / r.n)); }
      else if (r.freq === "weekly") planned = r.n === 1 ? Math.max(1, r.days.length || 1) : null;
      if (r.freq === "monthly" || (r.freq === "weekly" && r.n > 1)) { cadence = "monthly"; target = r.freq === "monthly" ? 1 : Math.min(4, Math.round(4.3 / r.n)); why = r.freq === "monthly" ? "Repeats monthly" : r.n === 2 ? "Repeats every other week" : `Repeats every ${r.n} weeks`; }
      else {
        days = r.freq === "weekly" ? r.days.slice() : [];
        const short = (median(x.durs) || 30) <= 30;
        cadence = planned >= 5 && short ? "daily" : "weekly";
        target = floorOf(planned);
        why = r.freq === "daily" ? (r.n === 1 ? "Repeats every day" : `Repeats every ${r.n} days`) : `Repeats ${days.map(d => DAYN[d]).join(", ") || "weekly"}`;
        if (actual != null && x.occ.length >= 3 && actual < planned * 0.85) {
          const t2 = Math.max(1, Math.min(target, Math.round(actual)));
          why += `, done about ${Math.round(actual * 10) / 10}× a week`; target = t2;
        }
      }
    } else {
      if (weeks.size < 3 || x.occ.length < 3) continue;
      if (actual >= 4) { cadence = "daily"; target = Math.min(7, Math.max(1, Math.round(actual * 0.9))); }
      else if (actual >= 0.75) { cadence = "weekly"; target = Math.max(1, Math.round(actual)); }
      else { cadence = "monthly"; target = Math.min(4, Math.max(1, Math.round(actual * 4.3))); }
      const dc = {}; x.days.forEach(d => dc[d] = (dc[d] || 0) + 1);
      if (cadence === "weekly") days = Object.entries(dc).filter(([, n]) => n >= Math.max(2, x.occ.length * 0.2)).sort((a, b) => b[1] - a[1]).slice(0, target).map(([d]) => +d).sort();
      why = `Done ${x.occ.length}× in ${spanW} weeks`;
    }
    const lib = libFor(title.toLowerCase());
    const chore = CHORE.test(title.toLowerCase()) || /\b(rent|water (the )?plants|feed|meds|medication|take out)\b/i.test(title);
    if (chore && !lib) continue;
    if (!v && !lib) { if (sample.kind !== "event" && !CARELEX.test(title.toLowerCase())) habits.push({ unplaced: true, name: cleanName(title), why, cadence, target, days, src: [...x.src][0], time: x.times.length ? tstr(roundTo(median(x.times), 5)) : "", dur: median(x.durs) || 30 }); continue; }
    const value = v || (LIB.find(c => c.id === lib) || {}).value;
    if (!value) continue;
    const libC = LIB.find(c => c.id === lib && c.value === value);
    const dur = median(x.durs) || (cadence === "daily" ? Math.min(20, libC ? Math.round(libC.hours * 60) || 15 : 15) : libC ? Math.round(libC.hours * 60) : 30);
    const tm = x.times.length ? tstr(roundTo(median(x.times), 5)) : "";
    const hours = Math.round(roundTo(Math.min(dur, 6 * 60), 5) / 60 * 100) / 100;
    const srcs = [...x.src];
    habits.push({ name: cleanName(title), value, cadence, target, hours: cadence === "daily" && hours > 1 ? 0.5 : hours, days, time: tm, why, lib: libC ? lib : null, src: srcs.includes("calendar") && srcs.length > 1 ? srcs.find(s => s !== "calendar") : srcs[0], weight: (actual || planned || target) * (cadence === "monthly" ? 0.25 : 1) });
  }
  /* merge duplicates onto the same library suggestion; keep the most frequent */
  const usedLib = new Set(), comps = [];
  const STOPW = new Set(["call", "text", "with", "the", "and", "for", "on", "a", "to", "my", "of", "in", "at"]);
  const words = t => new Set(norm(t).split(" ").filter(w => w.length > 2 && !STOPW.has(w)));
  const same = (a, b) => { const A = words(a), B = words(b); if (!A.size || !B.size) return false; let n = 0; A.forEach(w => B.has(w) && n++); return n / Math.min(A.size, B.size) >= 0.6; };
  habits.filter(h => !h.unplaced).sort((a, b) => b.weight - a.weight).forEach((h, i) => {
    const twin = comps.find(c => c.value === h.value && same(c.name, h.name));
    if (twin) { if (!twin.note.includes("also in")) twin.note += `, also in ${SRC_NAME[h.src] || "another app"}`; return; }
    let id = "imp-" + i + "-" + h.name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12);
    if (h.lib && !usedLib.has(h.lib)) { id = h.lib; usedLib.add(h.lib); }
    const c = { id, value: h.value, name: h.name, cadence: h.cadence, target: h.target, hours: h.hours, note: h.why, imp: SRC_NAME[h.src] || "your apps", on: true };
    if (h.cadence === "weekly" && (h.days.length || h.time)) c.block = { days: h.days.slice(0, 7), time: h.time || "", dur: Math.max(5, Math.round(h.hours * 60)) };
    if (h.lib === "reach") c.mvw = true;
    comps.push(c);
  });
  comps.splice(24);

  /* ---- 2. where the energy goes: value evidence ---- */
  const ev = {}; const add = (v, w, why) => { if (!v) return; const e = ev[v] = ev[v] || { score: 0, n: 0, done: 0, lists: {}, why: [] }; e.score += w; if (why) e.why.push(why); };
  for (const it of items) {
    if (!it.v) continue;
    const w = it.done ? (recent(it) ? 1.5 : 0.6) : it.kind === "event" ? (it.when && it.when <= now && recent(it) ? Math.min(3, (it.dur || 60) / 60) : 0.4) : 0.7;
    add(it.v, w); ev[it.v].n++; if (it.done) ev[it.v].done++;
    if (it.list && !GENERIC_LIST.test(it.list)) ev[it.v].lists[it.list] = (ev[it.v].lists[it.list] || 0) + 1;
  }
  comps.forEach(c => add(c.value, 4 + (c.cadence === "daily" ? c.target : c.cadence === "weekly" ? c.target * 1.5 : 1)));
  const total = Object.values(ev).reduce((a, e) => a + e.score, 0) || 1;
  const values = Object.entries(ev).map(([id, e]) => {
    const share = e.score / total, topList = Object.entries(e.lists).sort((a, b) => b[1] - a[1])[0];
    const nC = comps.filter(c => c.value === id).length;
    const reasons = [`${e.n} item${e.n === 1 ? "" : "s"}${e.done ? `, ${e.done} finished` : ""}`];
    if (nC) reasons.push(`${nC} habit${nC > 1 ? "s" : ""}`);
    if (topList) reasons.push(`“${topList[0]}” list`);
    return { id, name: vname(id), score: Math.round(e.score * 10) / 10, share, n: e.n, reasons, list: topList ? topList[0] : "", on: false };
  }).sort((a, b) => b.score - a.score);
  values.forEach((v, i) => { v.on = i < 7 && (v.share >= 0.05 || comps.some(c => c.value === v.id)) && v.score >= 2; });
  const chosen = values.filter(v => v.on);

  /* ---- 3. a season: the two values that clearly get the most ---- */
  const cores = (items.length < 25 ? [] : chosen).filter(v => v.share >= 0.18).slice(0, 2).map(v => { const top = comps.filter(c => c.value === v.id).slice(0, 2).map(c => c.name); return { value: v.id, text: "", hint: top.length ? `e.g. ${top.join(" and ")}, most weeks` : "" }; });

  /* ---- 4. your week, from the calendar ---- */
  const evts = items.filter(it => it.src === "calendar" && it.kind === "event" && it.start && !it.allDay && it.dur && it.start <= now && it.start >= new Date(now - 12 * WEEK));
  const week = {}; const weekWhy = [];
  if (evts.length >= 10) {
    const wset = new Set(evts.map(e => +mondayOf(e.start))), nW = Math.max(1, wset.size);
    const work = evts.filter(e => isWork(e) && !e.v && di(e.start) < 5);
    const perDay = {}; work.forEach(e => { const k = e.start.toDateString(); const s = e.start.getHours() * 60 + e.start.getMinutes(); const en = s + e.dur; const o = perDay[k] = perDay[k] || { s, e: en }; o.s = Math.min(o.s, s); o.e = Math.max(o.e, en); });
    const spans = Object.values(perDay).map(o => (o.e - o.s) / 60), dpw = spans.length / nW;
    if (nW >= 2 && dpw >= 2.5) {
      const est = Math.round(Math.min(70, Math.max(20, median(spans) * Math.min(5, Math.round(dpw)) + 1)) / 5) * 5;
      week.work = est; weekWhy.push(`Work about ${est} h a week, from meetings spread over ${Math.round(dpw * 10) / 10} days`);
    }
    const care = evts.filter(e => CARELEX.test(e.title.toLowerCase()));
    if (care.length / nW >= 2) { week.care = care.length / nW >= 5 ? 15 : 5; weekWhy.push("School runs or childcare show up every week"); }
    const fixed = evts.filter(e => !e.v && !isWork(e) && !CARELEX.test(e.title.toLowerCase()) && groups.get(e.key) && groups.get(e.key).occ.length >= nW * 0.6);
    const otherH = Math.round(fixed.reduce((a, e) => a + e.dur, 0) / 60 / nW);
    if (otherH >= 1) { week.other = Math.min(30, otherH); weekWhy.push(`${otherH} h of other regular commitments`); }
  }

  /* ---- 5. people you keep in touch with ---- */
  const REL = { mom: "Mom", mum: "Mum", mother: "Mom", dad: "Dad", father: "Dad", parents: "Parents", grandma: "Grandma", grandpa: "Grandpa", nana: "Nana", sister: "Sister", brother: "Brother" };
  const STOP = new Set("The A An My Me I We You Team All Everyone Client Clients Boss Manager Work Back Home Office Doctor Dentist Bank Mom Dad Mum Monday Tuesday Wednesday Thursday Friday Saturday Sunday Today Tomorrow January February March April May June July August September October November December Uber Amazon Google Apple Zoom Slack HR IT Support Insurance Landlord Plumber".split(" "));
  const pc = {};
  for (const it of items) {
    const t = it.title.replace(/^[A-Z](?=[a-z]+\s)/, c => c.toLowerCase()); let m;
    const re = /\b(?:call|text|message|facetime|visit|see|meet|email|ping|dinner with|lunch with|coffee with|drinks with|brunch with|catch ?up with|hang ?out with|birthday gift for|gift for|write to)\s+([A-Z][a-z]{1,15})(?:\s+([A-Z][a-z]{1,15}))?/g;
    while ((m = re.exec(t))) { const n = m[1]; if (STOP.has(n)) continue; const k = n; pc[k] = pc[k] || { name: n, n: 0, tier: "t2" }; pc[k].n++; }
    const b = t.match(/^([A-Z][a-z]{1,15})(?:\s[A-Z][a-z]{1,15})?['’]s birthday|birthday:?\s+([A-Z][a-z]{1,15})/);
    if (b) { const n = b[1] || b[2]; if (!STOP.has(n)) { pc[n] = pc[n] || { name: n, n: 0, tier: "t2" }; pc[n].n += 1; pc[n].bday = true; } }
    const r = t.toLowerCase().match(/\b(call|text|facetime|visit)\b.*\b(mom|mum|mother|dad|father|parents|grandma|grandpa|nana|sister|brother)\b/);
    if (r) { const n = REL[r[2]]; pc[n] = pc[n] || { name: n, n: 0, tier: "rel" }; pc[n].n++; pc[n].tier = "rel"; }
  }
  const people = Object.values(pc).filter(p => p.n >= 2 || p.bday || p.tier === "rel").sort((a, b) => b.n - a.n).slice(0, 12)
    .map(p => ({ name: p.name, tier: p.tier === "rel" ? "rel" : p.n >= 6 ? "t1" : "t2", n: p.n, on: true }));

  /* ---- 6. open tasks: inbox, and old ones to Someday so the inbox stays calm ---- */
  const habitKeys = new Set([...groups.values()].filter(x => x.rep).map(x => x.key));
  const seenT = new Set(), inbox = [], someday = [];
  for (const it of items) {
    if (it.done || it.kind === "event" || it.repeat || habitKeys.has(it.key)) continue;
    const k = it.key || it.title.toLowerCase(); if (seenT.has(k)) continue; seenT.add(k);
    const age = it.created || it.due || it.start;
    const old = age && now - age > 90 * 864e5;
    (old ? someday : inbox).push({ t: cleanName(it.title), v: it.v || null });
  }
  const tasks = { inbox: inbox.slice(0, 150), someday: someday.slice(0, 150), more: Math.max(0, inbox.length - 150) + Math.max(0, someday.length - 150) };

  /* ---- 7. fun menu ---- */
  const fun = [...new Set(items.filter(it => it.done || it.kind === "event").map(it => (FUNLEX.find(([re]) => re.test(it.title.toLowerCase())) || [])[1]).filter(Boolean))].slice(0, 4);

  /* ---- 8. trends worth saying out loud ---- */
  const insights = [];
  const doneR = items.filter(it => (it.done || it.kind === "event") && recent(it) && it.v);
  if (chosen.length) {
    const top = chosen.slice(0, 2);
    insights.push({ k: "energy", t: `Most of your energy goes to ${top.map(v => v.name).join(" and ")}${top[0].share >= 0.3 ? ` (${Math.round(top[0].share * 100)}% of what you track is ${top[0].name.toLowerCase()})` : ""}.` });
  }
  const scaled = comps.filter(c => /done about/.test(c.note || ""));
  if (scaled.length) insights.push({ k: "floors", t: `You plan more than you finish: ${scaled.slice(0, 2).map(c => c.name).join(" and ")}. Their floors start at what you actually do, so a normal week already counts.` });
  const all = items.filter(it => (it.done && it.doneAt && recent(it)) || (it.kind === "event" && recent(it) && it.v));
  if (all.length >= 15) {
    const dc = Array(7).fill(0); all.forEach(it => dc[di(it.when)]++);
    const max = dc.indexOf(Math.max(...dc)), min = dc.indexOf(Math.min(...dc));
    if (dc[max] > dc[min] * 1.8) insights.push({ k: "days", t: `${["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"][max]} are your busiest; ${["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"][min].toLowerCase()} the lightest.` });
    const hrsD = all.filter(it => it.doneAt && !it.doneAt.allDay).map(it => it.doneAt.getHours());
    if (hrsD.length >= 12) { const am = hrsD.filter(h => h >= 5 && h < 12).length / hrsD.length, pm = hrsD.filter(h => h >= 18 || h < 2).length / hrsD.length; if (am >= 0.45) insights.push({ k: "time", t: "You get most things done before noon. Morning blocks will be easiest to keep." }); else if (pm >= 0.45) insights.push({ k: "time", t: "You finish most things in the evening. Evening blocks will be easiest to keep." }); }
  }
  const openAll = inbox.length + someday.length;
  if (someday.length >= 10 && someday.length / Math.max(1, openAll) >= 0.25) insights.push({ k: "tasks", t: `${someday.length} of your ${openAll} open tasks are over three months old. They go to Someday, so your inbox starts light.` });
  const missing = H.filter(v => ["rel", "mind", "time", "body"].includes(v.id) && !chosen.some(c => c.id === v.id)).map(v => v.name);
  if (chosen.length && missing.length) insights.push({ k: "gap", t: `Nothing you track touches ${missing.slice(0, 2).join(" or ")}. If they matter, add them on the next screens; that is often where drift starts.` });
  if (!items.length) insights.push({ k: "none", t: "Nothing readable came through. Try a different export, or paste a list." });

  const doneCount = items.filter(i => i.done).length, evCount = items.filter(i => i.kind === "event").length;
  return {
    stats: { total: items.length, done: doneCount, events: evCount, open: items.length - doneCount - evCount, sources },
    values, cores, comps, week: Object.keys(week).length ? Object.assign(week, { why: weekWhy }) : null, people, tasks, fun, insights,
    unplaced: habits.filter(h => h.unplaced).slice(0, 6).map(h => ({ name: h.name, why: h.why, cadence: h.cadence, target: h.target, days: h.days || [], time: h.time, hours: Math.round(roundTo(h.dur, 5) / 60 * 100) / 100, imp: SRC_NAME[h.src] || "your apps", value: "" })),
    goalHint: chosen.length ? goalSentence(chosen, cores, vname) : "",
  };
}
function goalSentence(chosen, cores, vname) {
  const main = (cores.length ? cores.map(c => c.value) : chosen.slice(0, 2).map(v => v.id)).map(id => vname(id).toLowerCase());
  const rest = chosen.map(v => v.id).filter(id => !cores.some(c => c.value === id)).slice(0, 2).map(id => vname(id).toLowerCase());
  return `I want to keep growing in ${main.join(" and ")}${rest.length ? `, while staying steady on ${rest.join(" and ")}` : ""}, without it all feeling like a to-do list.`;
}
export const SOURCE_NAMES = SRC_NAME;

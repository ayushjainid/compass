// The Sunday email: for people who'd rather read their week than get a notification. Sent through Resend
// (RESEND_API_KEY, MAIL_FROM) at the person's review time, only if they turned it on and gave the address.
import { localDay, localMonday, nextAt, validTz } from "./time.js";
import { weekId } from "./today.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const emailOk = x => typeof x === "string" && x.length <= 200 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(x);

/** What the email says, from this week's document. Nothing is invented: ticks, days, the person's own lines. */
export function mailBody(week, appUrl) {
  const days = (week && week.days) || {}, keys = Object.keys(days).sort();
  let ticks = 0, active = 0; const wins = [];
  keys.forEach(k => { const d = days[k] || {}; const n = Object.values(d.a || {}).filter(v => v === true).length; ticks += n; if (n || (d.j && d.j.win)) active++; if (d.j && d.j.win) wins.push(String(d.j.win).slice(0, 160)); });
  ticks += Object.values((week && week.c) || {}).reduce((a, n) => a + (Number(n) > 0 ? Number(n) : 0), 0);
  const line = ticks ? `${ticks} thing${ticks > 1 ? "s" : ""} logged across ${active} day${active === 1 ? "" : "s"} this week.` : "A quiet week in Compass. That's fine; the review is still worth a few minutes.";
  const url = `${appUrl}/?tab=review&from=mail`;
  const text = [line, wins.length ? "\nIn your own words:\n" + wins.slice(0, 3).map(w => `- ${w}`).join("\n") : "", `\nYour Sunday review: ${url}`, "\nTurn this email off any time in Compass → Reminders."].join("\n");
  const html = `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;color:#1d2530;line-height:1.55">
<h2 style="font-weight:600;margin:0 0 8px">Your week</h2><p style="margin:0 0 14px">${esc(line)}</p>
${wins.length ? `<p style="margin:0 0 4px;color:#5b6573;font-size:14px">In your own words</p><ul style="margin:0 0 16px;padding-left:18px">${wins.slice(0, 3).map(w => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
<p style="margin:0 0 18px"><a href="${esc(url)}" style="background:#24476b;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-family:sans-serif;font-size:15px">Open your Sunday review</a></p>
<p style="color:#8a93a0;font-size:12px;font-family:sans-serif">Turn this email off any time in Compass → Reminders.</p></div>`;
  return { subject: "Your week in Compass", text, html };
}

/** Emails due now; each person's next one is booked a week on, whether or not this one could be sent. */
export async function mailWork(env, db, now, fetchFn, log) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return { mailed: 0 };
  const due = await db.due("notify", "nextMail", now, 50);
  let mailed = 0;
  for (const j of due) {
    const d = j.data, tz = validTz(d.tz) ? d.tz : "UTC", day = localDay(tz, now);
    const next = d.mail ? new Date(nextAt(tz, d.rev || "18:00", now + 60e3, 6)) : null;
    try { await db.patch([{ name: j.name, fields: { nextMail: next, mailDay: day } }]); } catch (e) { log("mail claim failed: " + e.message); continue; }
    if (!d.mail || !emailOk(d.mailTo) || d.mailDay === day || now - d.nextMail > 6 * 3600e3) continue;
    try {
      const base = `users/${j.id}/docs/`, wk = weekId(localMonday(tz, now)), got = await db.getMany([base + wk]);
      const m = mailBody(got[base + wk], env.APP_URL || "https://life-compass.web.app");
      const r = await fetchFn("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: env.MAIL_FROM, to: [d.mailTo], subject: m.subject, text: m.text, html: m.html }) });
      if (r.ok) mailed++; else log(`mail ${r.status} for ${j.id.slice(0, 6)}…`);
    } catch (e) { log("mail failed: " + e.message); }
  }
  return { mailed };
}

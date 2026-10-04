// The live calendar feed: GET /cal/<secret>.ics → that person's plan as an .ics their calendar app
// subscribes to and refreshes on its own. The secret is a random 43-character id the app made
// (calfeeds/<secret> = { uid, tz }); resetting it in the app deletes the old one, so old links stop working.
import { client } from "./firestore.js";
import { buildIcs, parse } from "../../public/shared/ics.js";
import { localDay, validTz } from "./time.js";

const TOKEN = /^\/cal\/([A-Za-z0-9_-]{32,64})(?:\.ics)?$/;
const gone = () => new Response("This calendar link isn't active. Get the current one in Compass → Week → Plan → Calendar.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function handleFeed(request, env, fetchFn = fetch, now = Date.now()) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("", { status: 405 });
  const m = TOKEN.exec(new URL(request.url).pathname); if (!m) return gone();
  const db = client(env, fetchFn), key = `calfeeds/${m[1]}`;
  const feed = (await db.getMany([key]))[key];
  if (!feed || typeof feed.uid !== "string") return gone();
  const base = `users/${feed.uid}/docs/`, got = await db.getMany([base + "profile", base + "settings"]);
  const profile = got[base + "profile"]; if (!profile) return gone();
  const settings = got[base + "settings"] || {}, zone = validTz(feed.tz) ? feed.tz : "UTC";
  /* only the link Compass currently shows works; one left behind by a reset or a lost delete is dead */
  if (settings.calFeed !== m[1]) return gone();
  const prefs = Object.assign({ alert: 0, daily: "each" }, settings.cal || {});
  const { text } = buildIcs({ profile, settings, today: parse(localDay(zone, now)), now: new Date(now), zone, alert: +prefs.alert, daily: prefs.daily, refresh: "PT6H", notes: false, weeksBack: 8 });
  return new Response(request.method === "HEAD" ? null : text, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=900", "Content-Disposition": 'inline; filename="compass.ics"', "X-Robots-Tag": "noindex" } });
}

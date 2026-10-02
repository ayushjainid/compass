// Backup → wipe → restore against the Firestore emulator (run inside `firebase emulators:exec`).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeApp } from "firebase-admin/app";
import * as F from "firebase-admin/firestore";
import { dump } from "../../scripts/backup/lib.mjs";
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.log("Run this inside the Firestore emulator."); process.exit(1); }
const R = []; const ok = (n, c, i) => R.push([n, !!c, i]);
const crash = e => { console.log(`::error title=crash::${String(e && (e.stack || e.message) || e).slice(0, 900).replace(/\r?\n/g, " | ")}${e && e.stderr ? " | stderr: " + String(e.stderr).slice(0, 600).replace(/\r?\n/g, " | ") : ""}${e && e.stdout ? " | stdout: " + String(e.stdout).slice(0, 400).replace(/\r?\n/g, " | ") : ""}`); process.exit(1); };
process.on("uncaughtException", crash);
process.on("unhandledRejection", e => { console.log(`::error title=crash::${String(e && (e.stack || e.message) || e).slice(0, 800).replace(/\r?\n/g, " | ")}`); process.exit(1); });
const project = "demo-compass", env = { ...process.env, FIREBASE_PROJECT: project, BACKUP_PASSPHRASE: "a long test passphrase for the emulator" };
const db = F.getFirestore(initializeApp({ projectId: project }));
const ts = F.Timestamp.fromMillis(Date.parse("2026-10-02T16:00:00.123Z"));
const seed = {
  "users/alice/docs/profile": { goal: "Grow", components: [{ id: "gym", block: { days: [0, 2, 4], time: "07:00" }, paused: "2026-09-28", pauses: [{ from: "2026-08-03", to: "2026-08-17" }] }] },
  "users/alice/docs/w-2026-09-28": { days: { "2026-09-28": { a: { gym: true }, j: { win: "é ✓ 😀" } } }, c: { gym: 2 }, _w: "dev:3:1" },
  "users/bob/docs/settings": { theme: "dark", seen: { d: "2026-10-02", de: { active: 1 } } },
  "notify/alice": { on: true, nextEve: ts, sub: { endpoint: "https://push.example/x", keys: { p256dh: "k", auth: "a" } } },
  "stats/d-2026-10-02": { active: 5, logged: 3 }, "status/reminders": { ok: true, at: ts, sent: { d20261002: 41 } },
  "feedback/bob-1": { uid: "bob", text: "nice", at: ts }, "admins/alice": { at: 1 },
};
for (const [p, d] of Object.entries(seed)) await db.doc(p).set(d);
const before = await dump(db, F);
const out = mkdtempSync(join(tmpdir(), "cbk-"));
console.log(execFileSync(process.execPath, ["scripts/backup/backup.mjs", out], { env, stdio: "pipe" }).toString());
const file = join(out, readdirSync(out)[0]);
ok("backup file written", /compass-\d{4}-\d{2}-\d{2}\.cbk$/.test(file), file);
// wipe everything, then a dry run must not write
for (const p of Object.keys(seed)) await db.doc(p).delete();
const dry = execFileSync(process.execPath, ["scripts/backup/restore.mjs", file], { env, stdio: "pipe" }).toString();
ok("dry run lists contents and writes nothing", /8 documents/.test(dry) && /Dry run/.test(dry) && (await dump(db, F)).length === 0, dry);
// one person
execFileSync(process.execPath, ["scripts/backup/restore.mjs", file, "--uid", "alice", "--yes"], { env, stdio: "pipe" });
const one = (await dump(db, F)).map(d => d.path);
ok("--uid restores just that person", one.join() === "notify/alice,users/alice/docs/profile,users/alice/docs/w-2026-09-28", one);
let refused = false; try { execFileSync(process.execPath, ["scripts/backup/restore.mjs", file, "--yes"], { env, stdio: "pipe" }); } catch (e) { refused = true; }
ok("everything needs --all", refused);
execFileSync(process.execPath, ["scripts/backup/restore.mjs", file, "--all", "--yes"], { env, stdio: "pipe" });
const after = await dump(db, F);
ok("everything back exactly, timestamps included", JSON.stringify(after) === JSON.stringify(before), { before: before.length, after: after.length });
ok("a timestamp field is a real Timestamp again", (await db.doc("notify/alice").get()).get("nextEve") instanceof F.Timestamp);
let wrong = ""; try { execFileSync(process.execPath, ["scripts/backup/restore.mjs", file], { env: { ...env, BACKUP_PASSPHRASE: "not the right passphrase at all" }, stdio: "pipe" }); } catch (e) { wrong = String(e.stderr); }
ok("wrong passphrase stops the restore", /Wrong passphrase/.test(wrong), wrong.slice(0, 200));
const f = R.filter(x => !x[1]); f.forEach(x => { console.log("  FAIL", x[0], JSON.stringify(x[2] ?? "").slice(0, 300)); if (process.env.GITHUB_ACTIONS) console.log(`::error title=${x[0].replace(/[,:]/g, " ")}::${JSON.stringify(x[2] ?? "").slice(0, 600).replace(/%/g, "%25")}`); });
console.log(`backup roundtrip: ${R.length - f.length}/${R.length} passed`); process.exit(f.length ? 1 : 0);

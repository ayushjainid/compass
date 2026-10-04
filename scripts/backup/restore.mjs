// Put documents back from a backup file. Safe by default: it only shows what it would do.
//
//   BACKUP_PASSPHRASE=… node scripts/backup/restore.mjs compass-2026-10-03.cbk                    # look inside
//   … restore.mjs FILE --uid <uid>                  # one person's data (users/<uid>/…, notify/<uid>), dry run
//   … restore.mjs FILE --only stats/ --only status/ # any path prefixes, dry run
//   … restore.mjs FILE --uid <uid> --yes            # actually write
//   … restore.mjs FILE --all --yes                  # everything
//
// It overwrites documents that are in the backup with their backed-up version. Documents created after the
// backup are left alone. Needs GOOGLE_APPLICATION_CREDENTIALS (a service-account key) like backup.mjs.
import { readFileSync } from "node:fs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import * as F from "firebase-admin/firestore";
import { open, load } from "./lib.mjs";

const args = process.argv.slice(2), file = args.find(a => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.match(/^--(uid|only)$/));
if (!file) { console.log("Usage: restore.mjs FILE [--uid UID | --only PREFIX ... | --all] [--yes]"); process.exit(1); }
const opt = n => args.flatMap((a, i) => (a === n ? [args[i + 1]] : []));
const uid = opt("--uid")[0], only = uid ? [`users/${uid}/`, `notify/${uid}`, `errors/${uid}`] : opt("--only"), all = args.includes("--all"), yes = args.includes("--yes");
const b = open(readFileSync(file), process.env.BACKUP_PASSPHRASE || "");
console.log(`Backup of ${b.project} taken ${b.at}: ${b.count} documents.`);
const pick = only.length ? b.docs.filter(d => only.some(p => d.path === p || d.path.startsWith(p.endsWith("/") ? p : p + "/"))) : b.docs;
const top = pick.reduce((m, d) => (m[d.path.split("/").slice(0, 2).join("/")] = (m[d.path.split("/").slice(0, 2).join("/")] || 0) + 1, m), {});
console.log(`${only.length ? "Selected" : "In the file"}: ${pick.length} documents`); Object.entries(top).slice(0, 40).forEach(([k, n]) => console.log(`  ${k}  ${n}`));
if (!yes) { console.log("\nDry run: nothing written. Add --yes to restore" + (only.length ? " these." : " (with --all for everything).")); process.exit(0); }
if (!only.length && !all) { console.log("Refusing to restore everything without --all."); process.exit(1); }
const project = process.env.FIREBASE_PROJECT || b.project;
const app = initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId: project } : { credential: applicationDefault(), projectId: project });
const n = await load(F.getFirestore(app), F, b.docs, only.length ? { only } : {});
console.log(`Restored ${n} documents to ${project}.`);

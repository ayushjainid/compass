// Nightly backup: every Firestore document → one encrypted file (see lib.mjs for the format).
//   GOOGLE_APPLICATION_CREDENTIALS=sa.json BACKUP_PASSPHRASE=… node scripts/backup/backup.mjs [out-dir]
// Run by .github/workflows/backup.yml every night; also works by hand.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import * as F from "firebase-admin/firestore";
import { seal, dump } from "./lib.mjs";

const project = process.env.FIREBASE_PROJECT || "compass-ayush", pass = process.env.BACKUP_PASSPHRASE || "";
const app = initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId: project } : { credential: applicationDefault(), projectId: project });
const db = F.getFirestore(app);
const t0 = Date.now(), docs = await dump(db, F, m => console.log(m));
const at = new Date().toISOString(), out = process.argv[2] || "backups";
mkdirSync(out, { recursive: true });
const file = join(out, `compass-${at.slice(0, 10)}.cbk`);
const buf = seal({ version: 1, project, at, count: docs.length, docs }, pass);
writeFileSync(file, buf);
const byTop = docs.reduce((m, d) => (m[d.path.split("/")[0]] = (m[d.path.split("/")[0]] || 0) + 1, m), {});
console.log(`Saved ${docs.length} documents (${Object.entries(byTop).map(([k, n]) => `${k} ${n}`).join(", ")}) to ${file}, ${(buf.length / 1024).toFixed(1)} KB, in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

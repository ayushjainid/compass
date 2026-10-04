// Shared by backup.mjs and restore.mjs: walk the database, turn it into plain JSON, and seal it.
//
// File format (.cbk): "CMPBK1" | salt (16) | iv (12) | auth tag (16) | AES-256-GCM( gzip( JSON ) )
// The key comes from the passphrase with scrypt, so the file is useless without it, and any change to the
// file (or a wrong passphrase) makes decryption fail instead of returning damaged data.
import { gzipSync, gunzipSync } from "node:zlib";
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from "node:crypto";

const MAGIC = Buffer.from("CMPBK1");
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const MIN_PASSPHRASE = 20;

export function seal(obj, passphrase) {
  if (!passphrase || passphrase.length < MIN_PASSPHRASE) throw new Error(`BACKUP_PASSPHRASE must be at least ${MIN_PASSPHRASE} characters`);
  const salt = randomBytes(16), iv = randomBytes(12), key = scryptSync(passphrase, salt, 32, SCRYPT);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(gzipSync(Buffer.from(JSON.stringify(obj)))), c.final()]);
  return Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), body]);
}
export function open(buf, passphrase) {
  if (!buf.subarray(0, 6).equals(MAGIC)) throw new Error("Not a Compass backup file");
  const salt = buf.subarray(6, 22), iv = buf.subarray(22, 34), tag = buf.subarray(34, 50), body = buf.subarray(50);
  const d = createDecipheriv("aes-256-gcm", scryptSync(passphrase || "", salt, 32, SCRYPT), iv); d.setAuthTag(tag);
  let plain; try { plain = Buffer.concat([d.update(body), d.final()]); } catch (e) { throw new Error("Wrong passphrase, or the file is damaged"); }
  return JSON.parse(gunzipSync(plain).toString("utf8"));
}

/* Firestore values that JSON can't hold are tagged, so a restore puts back exactly what was there. */
export function encode(v, F) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(x => encode(x, F));
  if (F && v instanceof F.Timestamp) return { __t: "ts", s: v.seconds, n: v.nanoseconds };
  if (F && v instanceof F.GeoPoint) return { __t: "geo", lat: v.latitude, lng: v.longitude };
  if (F && v instanceof F.DocumentReference) return { __t: "ref", p: v.path };
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return { __t: "bytes", b64: Buffer.from(v).toString("base64") };
  if (v instanceof Date) return { __t: "ts", s: Math.floor(v.getTime() / 1000), n: (v.getTime() % 1000) * 1e6 };
  const o = {}; for (const k of Object.keys(v)) o[k] = encode(v[k], F); return o;
}
export function decode(v, F, db) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(x => decode(x, F, db));
  if (v.__t === "ts") return new F.Timestamp(v.s, v.n);
  if (v.__t === "geo") return new F.GeoPoint(v.lat, v.lng);
  if (v.__t === "ref") return db.doc(v.p);
  if (v.__t === "bytes") return Buffer.from(v.b64, "base64");
  const o = {}; for (const k of Object.keys(v)) o[k] = decode(v[k], F, db); return o;
}

/* Every document, including ones under parents that don't exist themselves (users/{uid} has no document,
   only users/{uid}/docs/...). listDocuments() returns those "missing" parents, so nothing is skipped. */
export async function dump(db, F, log = () => {}) {
  const docs = [];
  const walkCollection = async col => {
    const refs = await col.listDocuments();
    for (let i = 0; i < refs.length; i += 300) {
      const part = refs.slice(i, i + 300), snaps = part.length ? await db.getAll(...part) : [];
      for (let j = 0; j < part.length; j++) {
        if (snaps[j].exists) docs.push({ path: part[j].path, data: encode(snaps[j].data(), F) });
        for (const sub of await part[j].listCollections()) await walkCollection(sub);
      }
    }
  };
  for (const col of await db.listCollections()) { log(`reading ${col.id}/…`); await walkCollection(col); }
  docs.sort((a, b) => (a.path < b.path ? -1 : 1));
  return docs;
}
export async function load(db, F, docs, { only } = {}) {
  const pick = only ? docs.filter(d => only.some(p => d.path === p || d.path.startsWith(p.endsWith("/") ? p : p + "/"))) : docs;
  for (let i = 0; i < pick.length; i += 400) {
    const b = db.batch();
    pick.slice(i, i + 400).forEach(d => b.set(db.doc(d.path), decode(d.data, F, db)));
    await b.commit();
  }
  return pick.length;
}

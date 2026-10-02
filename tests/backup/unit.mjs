// Backup format and walk, without a database: encryption, tamper and passphrase checks, value tagging,
// and a walk over an in-memory stand-in that has "missing" parent documents like users/{uid}.
import * as F from "firebase-admin/firestore";
import { seal, open, encode, decode, dump, load } from "../../scripts/backup/lib.mjs";
const R = []; const ok = (n, c, i) => R.push([n, !!c, i]);
process.on("unhandledRejection", e => { console.log(`::error title=crash::${String(e && (e.stack || e.message) || e).slice(0, 800).replace(/\r?\n/g, " | ")}`); process.exit(1); });
const PASS = "correct horse battery staple 42";

// ---- sealing
const obj = { version: 1, docs: [{ path: "a/b", data: { x: 1, s: "é✓" } }] };
const buf = seal(obj, PASS);
ok("round trip", JSON.stringify(open(buf, PASS)) === JSON.stringify(obj));
ok("no plaintext in the file", !buf.includes(Buffer.from("é✓")) && !buf.includes(Buffer.from('"path"')));
let e1 = ""; try { open(buf, PASS + "x"); } catch (e) { e1 = e.message; } ok("wrong passphrase refused", /Wrong passphrase/.test(e1), e1);
const bad = Buffer.from(buf); bad[bad.length - 5] ^= 1; let e2 = ""; try { open(bad, PASS); } catch (e) { e2 = e.message; } ok("tampered file refused", /damaged/.test(e2), e2);
let e3 = ""; try { seal(obj, "short"); } catch (e) { e3 = e.message; } ok("short passphrase refused", /at least 20/.test(e3), e3);
let e4 = ""; try { open(Buffer.from("hello world, not a backup at all......................"), PASS); } catch (e) { e4 = e.message; } ok("other files refused", /Not a Compass backup/.test(e4), e4);
ok("two seals of the same data differ (fresh salt and iv)", !seal(obj, PASS).equals(seal(obj, PASS)));

// ---- value tagging
const ts = new F.Timestamp(1790000000, 123000000);
const enc = encode({ t: ts, list: [ts, 1, "x", null, { deep: ts }], b: Buffer.from([1, 2, 3]), n: null, d: new Date(1700000000500) }, F);
ok("timestamps tagged with seconds and nanos", enc.t.__t === "ts" && enc.t.s === 1790000000 && enc.t.n === 123000000 && enc.list[4].deep.__t === "ts", enc);
const fakeDb = { doc: p => ({ path: p }) };
const dec = decode(JSON.parse(JSON.stringify(enc)), F, fakeDb);
ok("timestamps come back as Timestamps", dec.t instanceof F.Timestamp && dec.t.isEqual(ts) && dec.list[0].isEqual(ts) && dec.list[4].deep.isEqual(ts));
ok("bytes and dates come back", Buffer.isBuffer(dec.b) && dec.b.equals(Buffer.from([1, 2, 3])) && dec.d instanceof F.Timestamp && dec.d.toMillis() === 1700000000500);
ok("plain values untouched", dec.list[1] === 1 && dec.list[2] === "x" && dec.list[3] === null && dec.n === null);

// ---- walking an in-memory database
function memDb(seed) {
  const store = new Map(Object.entries(seed));
  const kids = (prefix) => { const s = new Set(); for (const p of store.keys()) if (p.startsWith(prefix)) s.add(p.slice(prefix.length).split("/")[0]); return [...s]; };
  const docRef = path => ({ path, id: path.split("/").pop(), listCollections: async () => kids(path + "/").map(id => colRef(path + "/" + id)) });
  const colRef = path => ({ id: path.split("/").pop(), path, listDocuments: async () => kids(path + "/").map(id => docRef(path + "/" + id)) });
  return {
    store, listCollections: async () => kids("").map(id => colRef(id)), doc: docRef,
    getAll: async (...refs) => refs.map(r => ({ exists: store.has(r.path), data: () => store.get(r.path) })),
    batch: () => { const ops = []; return { set: (r, d) => ops.push([r.path, d]), commit: async () => ops.forEach(([p, d]) => store.set(p, d)) }; },
  };
}
const db = memDb({ "users/a/docs/profile": { goal: "g", at: ts }, "users/a/docs/w-2026-09-28": { days: { "2026-09-28": { a: { x: true } } } }, "users/b/docs/settings": { theme: "dark" }, "notify/a": { on: true, nextEve: ts }, "stats/d-2026-10-02": { active: 3 }, "admins/a": { at: 1 } });
const docs = await dump(db, F);
ok("finds documents under parents that don't exist (users/{uid})", docs.length === 6 && docs.some(d => d.path === "users/b/docs/settings"), docs.map(d => d.path));
ok("sorted by path", docs.map(d => d.path).join() === [...docs.map(d => d.path)].sort().join());
const file = open(seal({ docs }, PASS), PASS);
const db2 = memDb({ "users/a/docs/profile": { goal: "CHANGED" }, "users/a/docs/w-2026-10-05": { later: 1 } });
const n1 = await load(db2, F, file.docs, { only: ["users/a/", "notify/a"] });
ok("restore one person: only their documents", n1 === 3 && db2.store.get("users/a/docs/profile").goal === "g" && !db2.store.has("users/b/docs/settings") && db2.store.has("notify/a"), [...db2.store.keys()]);
ok("restored timestamps are Timestamps", db2.store.get("notify/a").nextEve instanceof F.Timestamp && db2.store.get("notify/a").nextEve.isEqual(ts));
ok("documents made after the backup are left alone", db2.store.get("users/a/docs/w-2026-10-05").later === 1);
ok("prefix match doesn't spill into similar ids (users/a vs users/ab)", (await (async () => { const d3 = memDb({}); await load(d3, F, [{ path: "users/ab/docs/x", data: {} }, { path: "users/a/docs/y", data: {} }], { only: ["users/a/"] }); return [...d3.store.keys()]; })()).join() === "users/a/docs/y");

const f = R.filter(x => !x[1]); f.forEach(x => { console.log("  FAIL", x[0], JSON.stringify(x[2] ?? "").slice(0, 300)); if (process.env.GITHUB_ACTIONS) console.log(`::error title=${x[0].replace(/[,:]/g, " ")}::${JSON.stringify(x[2] ?? "").slice(0, 600).replace(/%/g, "%25")}`); });
console.log(`backup unit: ${R.length - f.length}/${R.length} passed`); process.exit(f.length ? 1 : 0);

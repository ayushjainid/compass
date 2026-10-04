// An in-memory stand-in for the Firestore REST calls the Worker makes (:runQuery, :batchGet, :commit),
// with nested field paths (`a`.`b-c`), updateTransforms increments and the exists precondition.
import { toValue, fromFields } from "../src/firestore.js";
export const P = "projects/demo/databases/(default)/documents";
export function fakeFirestore() {
  const store = new Map();   // full name -> REST fields
  const times = new Map(); let clock = 0;   // full name -> updateTime
  const segs = fp => { const out = []; let cur = "", q = false; for (let i = 0; i < fp.length; i++) { const ch = fp[i]; if (q) { if (ch === "\\") { cur += fp[++i]; } else if (ch === "`") q = false; else cur += ch; } else if (ch === "`") q = true; else if (ch === ".") { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
  const getIn = (fields, ss) => { let v = { mapValue: { fields } }; for (const s of ss) { v = v && v.mapValue && v.mapValue.fields[s]; } return v; };
  const setIn = (fields, ss, val) => { let o = fields; for (const s of ss.slice(0, -1)) { if (!o[s] || !o[s].mapValue) o[s] = { mapValue: { fields: {} } }; o = o[s].mapValue.fields; } o[ss[ss.length - 1]] = val; };
  const api = {
    store, calls: [],
    put(path, obj) { store.set(`${P}/${path}`, Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toValue(v)]))); times.set(`${P}/${path}`, "t" + (++clock)); },
    get(path) { const f = store.get(`${P}/${path}`); return f ? fromFields(f) : null; },
    async fetch(url, init) {
      const u = String(url); api.calls.push(u.split("/documents")[1] || u);
      if (u.includes(":batchGet")) {
        const { documents } = JSON.parse(init.body);
        return new Response(JSON.stringify(documents.map(n => store.has(n) ? { found: { name: n, fields: store.get(n), updateTime: times.get(n) || "t0" } } : { missing: n })), { status: 200 });
      }
      if (u.includes(":commit")) {
        const { writes } = JSON.parse(init.body);
        if (api.beforeCommit) await api.beforeCommit(writes);   // lets a test land a rival write first
        if (writes.some(w => w.currentDocument && w.currentDocument.exists && !store.has(w.update.name))) return new Response("NOT_FOUND", { status: 404 });
        if (writes.some(w => w.currentDocument && w.currentDocument.exists === false && store.has(w.update.name))) return new Response('{"error":{"status":"ALREADY_EXISTS"}}', { status: 409 });
        if (writes.some(w => w.currentDocument && w.currentDocument.updateTime && w.currentDocument.updateTime !== (times.get(w.update.name) || "t0"))) return new Response('{"error":{"status":"FAILED_PRECONDITION"}}', { status: 400 });
        for (const w of writes) {
          const cur = store.get(w.update.name) || {}; store.set(w.update.name, cur); times.set(w.update.name, "t" + (++clock));
          for (const fp of w.updateMask.fieldPaths) { const ss = segs(fp), v = getIn(w.update.fields, ss); setIn(cur, ss, v); }
          for (const t of w.updateTransforms || []) { const ss = segs(t.fieldPath), old = getIn(cur, ss); const n = +((old && (old.integerValue ?? old.doubleValue)) || 0) + +(t.increment.integerValue ?? t.increment.doubleValue); setIn(cur, ss, Number.isInteger(n) ? { integerValue: String(n) } : { doubleValue: n }); }
        }
        return new Response("{}", { status: 200 });
      }
      if (u.includes(":runQuery")) return new Response(JSON.stringify([{ readTime: "x" }]), { status: 200 });
      return new Response("not handled " + u, { status: 500 });
    },
  };
  return api;
}

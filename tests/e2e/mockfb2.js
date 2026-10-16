// Two-device stand-in for the Firebase SDK (test only).
// The "server" lives in the Node test process (window.__srv binding), shared by every page.
// Each page has its own local cache. Offline (navigator.onLine === false) behaves like the real SDK:
// setDoc applies locally at once and is queued, delivered blindly in order once back online;
// snapshots from the server stop until then; transactions fail with "unavailable".
let authCb = null, current = JSON.parse(localStorage.getItem("__mockuser") || "null");
export const initializeApp = cfg => ({ cfg });
export const getAuth = () => ({ get currentUser() { return current; } });
export class GoogleAuthProvider { setCustomParameters() {} }
export const onAuthStateChanged = (a, cb) => { authCb = cb; setTimeout(() => cb(current), 50); return () => {}; };
export const signInWithPopup = async () => { current = { uid: "u1", displayName: "Ayush Jain", email: "a@example.com", photoURL: "", metadata: { lastSignInTime: new Date().toUTCString() } }; localStorage.setItem("__mockuser", JSON.stringify(current)); setTimeout(() => authCb(current), 30); return { user: current }; };
export const signInWithRedirect = async () => {};
export const getRedirectResult = async () => null;
export const signOut = async () => { current = null; localStorage.removeItem("__mockuser"); setTimeout(() => authCb(null), 10); };
export const deleteUser = signOut;
export const reauthenticateWithPopup = async () => {};
export const reauthenticateWithRedirect = async () => {};
export const initializeFirestore = () => ({});
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
export const terminate = async () => {};
export const clearIndexedDbPersistence = async () => {};
export const doc = (fs, ...segs) => ({ path: segs.join("/"), type: "doc" });
export const collection = (fs, ...segs) => ({ path: segs.join("/"), type: "col" });
export const where = (f, op, v) => ({ f, op, v, kind: "where" });
export const limit = n => ({ kind: "limit", n });
export const query = (c, ...cons) => ({ c, w: cons.find(x => x && x.kind === "where"), cons, type: "query" });
export const deleteField = () => ({ __del: true });
export const arrayUnion = (...v) => ({ __au: v });
export const arrayRemove = (...v) => ({ __ar: v });

const nestedArr = (v, inArr) => Array.isArray(v) ? (inArr || v.some(x => nestedArr(x, true))) : (v && typeof v === "object" ? Object.values(v).some(x => nestedArr(x, false)) : false);
const refuseNested = d => { if (nestedArr(d, false)) { const e = new Error("Property array contains an invalid nested entity"); e.code = "invalid-argument"; window.__nestedRefused = (window.__nestedRefused || 0) + 1; throw e; } };
const cache = {};            // this device's view: path -> data
const queue = [];            // offline writes waiting for the network
const listeners = {};        // path -> [cb]
const online = () => navigator.onLine !== false;
const cp = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
const snapOf = (path, data) => ({ id: path.split("/").pop(), exists: () => data !== undefined && data !== null, data: () => cp(data) });
const fire = path => (listeners[path] || []).forEach(cb => cb(snapOf(path, cache[path])));
const unavailable = () => { const e = new Error("offline"); e.code = "unavailable"; return e; };
window.__snap = (path, data) => { if (!online()) return; cache[path] = cp(data); fire(path); };   // server push
window.__cache = cache;
async function drain() {
  while (queue.length && online()) { const w = queue.shift(); await window.__srv({ op: "set", path: w.path, data: w.data, merge: w.merge }); w.done(); }
}
window.addEventListener("online", () => { drain().then(async () => { for (const p of Object.keys(listeners)) { const r = await window.__srv({ op: "get", path: p }); cache[p] = r.data; fire(p); } }); });

export const setDoc = (r, data, opt) => {
  refuseNested(data);
  const merge = !!(opt && opt.merge);
  cache[r.path] = merge ? Object.assign(cp(cache[r.path]) || {}, cp(data)) : cp(data);
  fire(r.path);
  return new Promise(res => { queue.push({ path: r.path, data: cp(data), merge, done: res }); drain(); });
};
export const getDoc = async r => {
  if (!online()) return snapOf(r.path, cache[r.path]);
  const x = await window.__srv({ op: "get", path: r.path }); cache[r.path] = x.data; return snapOf(r.path, x.data);
};
const matchQ = (q, row) => { for (const c of (q.cons || [])) if (c && c.kind === "where") { const v = row.data && row.data[c.f]; if (c.op === "==" && v !== c.v) return false; if (c.op === "array-contains" && !(Array.isArray(v) && v.includes(c.v))) return false; if (c.op === ">=" && !(v >= c.v)) return false; } return true; };
async function listQ(q) {
  const base = q.type === "query" ? q.c.path : q.path;
  const rows = online() ? (await window.__srv({ op: "list", prefix: base + "/" })).rows : Object.entries(cache).filter(([k]) => k.startsWith(base + "/")).map(([path, data]) => ({ path, data }));
  const docs = rows.filter(r => r.data && r.path.split("/").length === base.split("/").length + 1 && matchQ(q, r)).map(r => ({ id: r.path.split("/").pop(), ref: { path: r.path }, data: () => cp(r.data) }));
  return { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f), metadata: { fromCache: !online(), hasPendingWrites: false } };
}
export const updateDoc = (r, data) => setDoc(r, data, { merge: true });
export const onSnapshot = (r, next, err) => {
  if (r.type === "query" || r.type === "col") { let live = true; const tick = async () => { if (!live) return; try { next(await listQ(r)); } catch (e) {} }; setTimeout(tick, 30); const iv = setInterval(tick, 1500); return () => { live = false; clearInterval(iv); }; }
  (listeners[r.path] = listeners[r.path] || []).push(next);
  window.__srv({ op: "sub", path: r.path });
  setTimeout(async () => { if (online()) { const x = await window.__srv({ op: "get", path: r.path }); if (!queue.some(q => q.path === r.path)) cache[r.path] = x.data; } next(snapOf(r.path, cache[r.path])); }, 20);
  return () => { listeners[r.path] = (listeners[r.path] || []).filter(x => x !== next); };
};
export const getDocs = async q => {
  if (q.type === "query" && (q.cons || []).some(c => c && c.op && c.op !== "==")) return listQ(q);
  const base = q.c ? q.c.path : q.path;
  const rows = online() ? (await window.__srv({ op: "list", prefix: base + "/" })).rows : Object.entries(cache).filter(([k]) => k.startsWith(base + "/")).map(([path, data]) => ({ path, data }));
  return { docs: rows.filter(r => r.data && (!q.w || r.data[q.w.f] === q.w.v)).map(r => ({ id: r.path.split("/").pop(), ref: { path: r.path }, data: () => cp(r.data) })) };
};
export const deleteDoc = async r => { delete cache[r.path]; if (online()) await window.__srv({ op: "del", path: r.path }); };
export const writeBatch = () => { const ops = []; return { delete: r => ops.push(["d", r]), set: (r, d, o) => ops.push(["s", r, d, o]), update: (r, d) => ops.push(["s", r, d, { merge: true }]), commit: async () => { for (const [k, r, d, o] of ops) { if (k === "d") await deleteDoc(r); else await setDoc(r, d, o); } } }; };
export const runTransaction = async (fs, fn) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!online()) throw unavailable();
    const reads = {}, writes = [];
    const tx = {
      get: async r => { const x = await window.__srv({ op: "get", path: r.path }); reads[r.path] = x.v; return snapOf(r.path, x.data); },
      set: (r, data) => { refuseNested(data); writes.push({ path: r.path, data: cp(data) }); return tx; },
    };
    const out = await fn(tx);
    if (window.__txDelay) await new Promise(r => setTimeout(r, window.__txDelay));
    if (!online()) throw unavailable();
    const res = await window.__srv({ op: "tx", reads, writes });
    if (res.ok) { for (const w of writes) { cache[w.path] = w.data; } if (window.__failAfterCommit) { window.__failAfterCommit = 0; throw unavailable(); } return out; }
  }
  const e = new Error("contention"); e.code = "aborted"; throw e;
};
export const initializeAppCheck = () => ({});
export class ReCaptchaEnterpriseProvider { constructor(k) { this.k = k; } }
export const increment = n => ({ __inc: n });

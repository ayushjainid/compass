// In-memory stand-in for the Firebase SDK surface Compass uses (test only).
const store = (window.__store = window.__store || JSON.parse(localStorage.getItem("__mockstore") || "{}"));
const save = () => localStorage.setItem("__mockstore", JSON.stringify(store));
const listeners = {};
let authCb = null;
/* collaboration tests open one tab per person: a tab can carry its own signed-in user (sessionStorage) */
const TAB_USER = (() => { try { return sessionStorage.getItem("__mockuserTab"); } catch (e) { return null; } })();
let current = JSON.parse(TAB_USER || localStorage.getItem("__mockuser") || "null");
const keepUser = () => { if (TAB_USER !== null) sessionStorage.setItem("__mockuserTab", JSON.stringify(current)); else if (current) localStorage.setItem("__mockuser", JSON.stringify(current)); else localStorage.removeItem("__mockuser"); };
export const initializeApp = cfg => ({ cfg });
export const getAuth = () => ({ get currentUser() { return current; } });
export class GoogleAuthProvider { setCustomParameters() {} }
export const onAuthStateChanged = (a, cb) => { authCb = cb; setTimeout(() => cb(current), 50); return () => {}; };
export const signInWithPopup = async () => { if (TAB_USER && JSON.parse(TAB_USER)) { current = JSON.parse(TAB_USER); setTimeout(() => authCb(current), 30); return { user: current }; } current = { uid: "u1", displayName: "Ayush Jain", email: "a@example.com", photoURL: "", providerData: [{ providerId: "google.com" }], metadata: { lastSignInTime: new Date(Date.now() - (window.__staleMin || 0) * 60000).toUTCString() } }; keepUser(); setTimeout(() => authCb(current), 30); return { user: current }; };
export const signInWithRedirect = async () => {};
export const getRedirectResult = async () => null;
export const signOut = async () => { current = null; keepUser(); setTimeout(() => authCb(null), 10); };
export const initializeFirestore = () => ({});
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
export const doc = (fs, ...segs) => ({ path: segs.join("/"), type: "doc" });
export const collection = (fs, ...segs) => ({ path: segs.join("/"), type: "col" });
export const where = (f, op, v) => ({ kind: "where", f, op, v });
export const limit = n => ({ kind: "limit", n });
export const query = (c, ...cons) => ({ c, cons, type: "query", w: cons.find(x => x && x.kind === "where") });
export const deleteField = () => ({ __del: true });
export const arrayUnion = (...v) => ({ __au: v });
export const arrayRemove = (...v) => ({ __ar: v });
const nestedArr = (v, inArr) => Array.isArray(v) ? (inArr || v.some(x => nestedArr(x, true))) : (v && typeof v === "object" ? Object.values(v).some(x => nestedArr(x, false)) : false);
const refuseNested = d => { if (nestedArr(d, false)) { const e = new Error("Property array contains an invalid nested entity"); e.code = "invalid-argument"; window.__nestedRefused = (window.__nestedRefused || 0) + 1; throw e; } };
const cpj = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
const snap = path => ({ id: path.split("/").pop(), ref: { path }, exists: () => path in store, data: () => store[path] && cpj(store[path]) });
const denied = () => { const e = new Error("denied"); e.code = "permission-denied"; return e; };
const parentOf = p => p.split("/").slice(0, -1).join("/");
/* sentinels: delete, array union/remove, increment; maps merge key by key (like Firestore's merge) */
const isPlain = v => v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype && !v.__del && !v.__au && !v.__ar && v.__inc === undefined;
function resolve(oldV, v, path, statPath) {
  if (v && v.__au) { const a = Array.isArray(oldV) ? oldV.slice() : []; v.__au.forEach(x => { if (!a.some(y => JSON.stringify(y) === JSON.stringify(x))) a.push(x); }); return a; }
  if (v && v.__ar) return (Array.isArray(oldV) ? oldV : []).filter(y => !v.__ar.some(x => JSON.stringify(x) === JSON.stringify(y)));
  if (v && v.__inc !== undefined) { if (statPath) window.__statWrites = (window.__statWrites || []).concat(statPath); return (typeof oldV === "number" ? oldV : 0) + v.__inc; }
  return cpj(v);
}
function mergeInto(target, data, statPath) {
  for (const [k, v] of Object.entries(data)) {
    if (v && v.__del) { delete target[k]; continue; }
    if (isPlain(v)) { const t = target[k] && typeof target[k] === "object" && !Array.isArray(target[k]) ? target[k] : (target[k] = {}); mergeInto(t, v, statPath && statPath + "." + k); continue; }
    target[k] = resolve(target[k], v, null, statPath ? statPath.split(":")[0] + ":" + k : null);
  }
  return target;
}
function fresh(data) { const out = {}; for (const [k, v] of Object.entries(data)) { if (v && v.__del) continue; out[k] = isPlain(v) ? fresh(v) : resolve(undefined, v); } return out; }
/* updateDoc: "a.b.c" keys are paths into maps */
function applyPaths(target, data) {
  for (const [k, v] of Object.entries(data)) {
    const segs = k.split("."); let o = target; for (const sg of segs.slice(0, -1)) { if (!o[sg] || typeof o[sg] !== "object" || Array.isArray(o[sg])) o[sg] = {}; o = o[sg]; }
    const last = segs[segs.length - 1];
    if (v && v.__del) delete o[last]; else if (isPlain(v)) o[last] = fresh(v); else o[last] = resolve(o[last], v);
  }
  return target;
}
const me = () => current && current.uid;
/* a rough copy of firestore.rules (the real ones are checked against the emulator in tests/rules) */
function allowed(op, path, before, after) {
  const uid = me(), seg = path.split("/");
  if (!uid) return false;
  if (seg[0] === "users") return seg[1] === uid;
  if (seg[0] === "notify" || seg[0] === "errors") return seg[1] === uid;
  if (seg[0] === "feedback") return path.startsWith("feedback/" + uid + "-");
  if (seg[0] === "calfeeds") return /^[A-Za-z0-9_-]{43}$/.test(seg[1]) && (op === "delete" ? before && before.uid === uid : after.uid === uid && (!before || before.uid === uid));
  if (seg[0] === "stats") return /^[dw]-\d{4}-\d{2}-\d{2}$/.test(seg[1]) && op !== "delete";
  if (seg[0] === "invites" && seg.length === 2) {
    if (op === "delete") return before && before.from === uid;
    if (before) return false;
    if (after.from !== uid || !/^[A-Za-z0-9_-]{20,64}$/.test(seg[1])) return false;
    if (after.kind === "list") { const l = store["lists/" + after.list]; return !!l && (l.members || []).includes(uid) && l.kind !== "inbox"; }
    if (after.kind === "watch") return after.watch === uid;
    return after.kind === "app";
  }
  if (seg[0] === "lists" && seg.length === 2) {
    if (op === "delete") return before && before.owner === uid;
    if (!before) return after.owner === uid && JSON.stringify(after.members) === JSON.stringify([uid]) && (after.kind === "inbox" ? seg[1] === "in-" + uid : /^l-[\w-]{4,40}$/.test(seg[1]));
    const was = before.members || [], now = after.members || [];
    if (after.owner !== before.owner && !(before.owner === uid && now.includes(after.owner))) return false;
    if (JSON.stringify(was) === JSON.stringify(now)) return was.includes(uid) && (before.owner === uid || (after.gen || 0) === (before.gen || 0));
    if (!was.includes(uid) && now.length === was.length + 1 && now.includes(uid) && was.every(x => now.includes(x))) {
      const inv = store["invites/" + after.via]; return before.kind === "list" && !!inv && inv.kind === "list" && inv.list === seg[1] && inv.exp > Date.now() && now.length <= 20 && was.includes(inv.from) && (inv.gen || 0) === (before.gen || 0);
    }
    if (was.includes(uid) && now.length < was.length && now.every(x => was.includes(x))) return before.owner === uid || (now.length === was.length - 1 && !now.includes(uid));
    return false;
  }
  if (seg[0] === "lists" && seg[2] === "items") { const l = store["lists/" + seg[1]]; return !!l && (l.members || []).includes(uid); }
  if (seg[0] === "watch" && seg.length === 2) {
    if (seg[1] === uid) return before || op === "delete" ? true : (after.watchers || []).length === 0;
    if (!before) return false;
    const was = before.watchers || [], now = after ? after.watchers || [] : [];
    if (op === "delete") return false;
    if (!was.includes(uid) && now.length === was.length + 1 && now.includes(uid)) { const inv = store["invites/" + after.via]; return !!inv && inv.kind === "watch" && inv.watch === seg[1] && inv.from === seg[1] && inv.exp > Date.now() && (inv.gen || 0) === (before.gen || 0); }
    if (was.includes(uid) && !now.includes(uid) && now.length === was.length - 1) return true;
    return false;
  }
  if (seg[0] === "watch" && seg[2] === "cheers") { const w = store["watch/" + seg[1]]; if (op === "delete") return seg[1] === uid; return !before && !!w && (w.watchers || []).includes(uid) && after.from === uid; }
  return false;
}
function readable(path) {
  const uid = me(), seg = path.split("/"); const d = store[path];
  if (!uid) return seg[0] === "invites";
  if (seg[0] === "lists" && seg.length === 2) return !d || (d.members || []).includes(uid);
  if (seg[0] === "lists" && seg[2] === "items") { const l = store["lists/" + seg[1]]; return !!l && (l.members || []).includes(uid); }
  if (seg[0] === "watch" && seg.length === 2) return seg[1] === uid || !d || (d.watchers || []).includes(uid);
  if (seg[0] === "watch" && seg[2] === "cheers") return seg[1] === uid;
  return true;
}
/* listeners: one document, or a collection/query */
const qlisteners = [];
const matches = (q, path) => {
  const base = q.type === "query" ? q.c.path : q.path;
  if (parentOf(path) !== base) return false;
  const d = store[path]; if (!d) return false;
  for (const c of (q.cons || [])) if (c && c.kind === "where") {
    const v = c.f.split(".").reduce((o, k) => o == null ? undefined : o[k], d);
    if (c.op === "==" && v !== c.v) return false;
    if (c.op === "array-contains" && !(Array.isArray(v) && v.includes(c.v))) return false;
    if (c.op === "in" && !c.v.includes(v)) return false;
  }
  return true;
};
function qsnap(q) {
  const lim = ((q.cons || []).find(c => c && c.kind === "limit") || {}).n;
  let keys = Object.keys(store).filter(k => matches(q, k) && readable(k));
  if (lim) keys = keys.slice(0, lim);
  const docs = keys.map(k => ({ id: k.split("/").pop(), ref: { path: k }, data: () => cpj(store[k]), exists: () => true }));
  return { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f), metadata: { hasPendingWrites: false, fromCache: false } };
}
function fireAll(path) {
  (listeners[path] || []).forEach(cb => cb(snap(path)));
  qlisteners.filter(l => (l.q.type === "query" ? l.q.c.path : l.q.path) === parentOf(path)).forEach(l => l.cb(qsnap(l.q)));
}
/* another tab (another person in the collaboration tests) wrote: reload and tell everyone */
window.addEventListener("storage", e => {
  if (e.key !== "__mockstore") return;
  const next = JSON.parse(e.newValue || "{}"); Object.keys(store).forEach(k => delete store[k]); Object.assign(store, next);
  Object.keys(listeners).forEach(p => (listeners[p] || []).forEach(cb => cb(snap(p))));
  qlisteners.forEach(l => l.cb(qsnap(l.q)));
});
function write(path, data, mode) {
  const before = store[path] ? cpj(store[path]) : undefined;
  let after;
  if (mode === "delete") after = undefined;
  else if (mode === "update") { if (!before) { const e = new Error("No document to update"); e.code = "not-found"; throw e; } after = applyPaths(cpj(before), data); }
  else if (mode === "merge") after = mergeInto(before ? cpj(before) : {}, data, /^stats\//.test(path) ? path : null);
  else after = fresh(data);
  if (!allowed(mode === "delete" ? "delete" : before ? "update" : "create", path, before, after)) throw denied();
  if (after === undefined) delete store[path]; else store[path] = after;
  return path;
}
export const setDoc = async (r, data, opt) => {
  refuseNested(data);
  const uid = me();
  /* stats tallies: exactly one counter, +1 */
  if (/^stats\//.test(r.path) && !(Object.keys(data).length === 1 && data[Object.keys(data)[0]] && data[Object.keys(data)[0]].__inc === 1)) throw denied();
  if (/^stats\//.test(r.path)) { const k = Object.keys(data)[0]; window.__statWrites = (window.__statWrites || []).concat(r.path + ":" + k); const cur = store[r.path] || {}; cur[k] = (cur[k] || 0) + 1; if (!uid) throw denied(); store[r.path] = cur; save(); fireAll(r.path); return; }
  write(r.path, data, opt && opt.merge ? "merge" : "set"); save(); fireAll(r.path);
};
export const updateDoc = async (r, data) => { refuseNested(data); write(r.path, data, "update"); save(); fireAll(r.path); };
export const getDoc = async r => { if (navigator.onLine === false && localStorage.getItem("__failOffline")) { const e = new Error("offline"); e.code = "unavailable"; throw e; } if (!readable(r.path)) throw denied(); return snap(r.path); };
export const onSnapshot = (r, next, err) => {
  if (r.type === "doc" || (!r.type && r.path)) {
    if (!readable(r.path)) { setTimeout(() => err && err(denied()), 10); return () => {}; }
    (listeners[r.path] = listeners[r.path] || []).push(next); setTimeout(() => next(snap(r.path)), 20);
    return () => { listeners[r.path] = (listeners[r.path] || []).filter(x => x !== next); };
  }
  const l = { q: r, cb: next }; qlisteners.push(l); setTimeout(() => { if (qlisteners.includes(l)) next(qsnap(r)); }, 20);
  return () => { const i = qlisteners.indexOf(l); if (i >= 0) qlisteners.splice(i, 1); };
};
export const getDocs = async q => qsnap(q.type ? q : { path: q.path, type: "col" });
export const deleteDoc = async r => { if (store[r.path] !== undefined) write(r.path, null, "delete"); save(); fireAll(r.path); };
export const deleteUser = async () => { try { const a = JSON.parse(localStorage.getItem("__mockaccounts") || "{}"); if (current && a[current.email]) { delete a[current.email]; localStorage.setItem("__mockaccounts", JSON.stringify(a)); } } catch (e) {} current = null; keepUser(); setTimeout(() => authCb(null), 10); };
export const reauthenticateWithPopup = async () => { window.__reauth = (window.__reauth || 0) + 1; if (window.__popupBlocked) { const e = new Error("blocked"); e.code = "auth/popup-blocked"; throw e; } if (current) current.metadata = { lastSignInTime: new Date().toUTCString() }; };

export const writeBatch = () => { const ops = []; return { delete: r => ops.push(["delete", r]), set: (r, d, o) => ops.push(["set", r, d, o]), update: (r, d) => ops.push(["update", r, d]),
  commit: () => { if (window.__hangCommit) return new Promise(() => {}); const snapAll = cpj(store); try { for (const [op, r, d, o] of ops) { if (op === "delete") { if (store[r.path] !== undefined) { const before = store[r.path]; if (/^(lists|invites|watch)\//.test(r.path) && !allowed("delete", r.path, before)) throw denied(); delete store[r.path]; } } else { refuseNested(d); write(r.path, d, op === "update" ? "update" : o && o.merge ? "merge" : "set"); } } } catch (e) { Object.keys(store).forEach(k => delete store[k]); Object.assign(store, snapAll); return Promise.reject(e); } save(); ops.forEach(([, r]) => fireAll(r.path)); return Promise.resolve(); } }; };
export const terminate = async () => {};
export const clearIndexedDbPersistence = async () => {};
export const reauthenticateWithRedirect = async () => { window.__reauthRedirect = (window.__reauthRedirect || 0) + 1; };

export const runTransaction = async (fs, fn) => { window.__tx = (window.__tx || 0) + 1;
  if (window.__offline) { const e = new Error("offline"); e.code = "unavailable"; throw e; }
  const writes = [];
  const tx = { get: async r => snap(r.path), set: (r, d) => { refuseNested(d); writes.push([r.path, JSON.parse(JSON.stringify(d))]); return tx; } };
  const out = await fn(tx);
  writes.forEach(([p, d]) => { store[p] = d; }); save(); writes.forEach(([p]) => (listeners[p] || []).forEach(cb => cb(snap(p))));
  return out;
};
export const initializeAppCheck = (app, o) => { window.__ac = o && o.provider && o.provider.k; return {}; };
export class ReCaptchaEnterpriseProvider { constructor(k) { this.k = k; } }
export const increment = n => ({ __inc: n });

// ---- email + password (test only): accounts live in localStorage
const accts = () => JSON.parse(localStorage.getItem("__mockaccounts") || "{}");
const saveAccts = a => localStorage.setItem("__mockaccounts", JSON.stringify(a));
const authErr = code => { const e = new Error(code); e.code = code; return e; };
const asUser = (email, a) => ({ uid: a.uid, displayName: a.name || "", email, photoURL: "", providerData: [{ providerId: "password" }], metadata: { lastSignInTime: new Date(Date.now() - (window.__staleMin || 0) * 60000).toUTCString() } });
const become = u => { current = u; keepUser(); setTimeout(() => authCb(current), 30); return { user: current }; };
export const createUserWithEmailAndPassword = async (auth, email, pw) => {
  if (window.__authOff) throw authErr("auth/operation-not-allowed");
  const a = accts(); email = String(email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw authErr("auth/invalid-email");
  if (a[email]) throw authErr("auth/email-already-in-use");
  if (String(pw).length < 6) throw authErr("auth/weak-password");
  a[email] = { pw, uid: "e" + Math.random().toString(36).slice(2, 10), name: "" }; saveAccts(a);
  return become(asUser(email, a[email]));
};
export const signInWithEmailAndPassword = async (auth, email, pw) => {
  const a = accts(), x = a[String(email).toLowerCase()];
  if (!x || x.pw !== pw) throw authErr("auth/invalid-credential");
  return become(asUser(String(email).toLowerCase(), x));
};
export const sendPasswordResetEmail = async (auth, email) => { window.__resets = (window.__resets || []).concat(email); };
export const sendEmailVerification = async u => { window.__verifies = (window.__verifies || []).concat(u.email); };
export const updateProfile = async (u, p) => { const a = accts(); if (a[u.email]) { a[u.email].name = p.displayName; saveAccts(a); } if (current) { current.displayName = p.displayName; keepUser(); } };
export const EmailAuthProvider = { credential: (email, pw) => ({ email, pw }) };
export const reauthenticateWithCredential = async (u, cred) => { const x = accts()[cred.email]; if (!x || x.pw !== cred.pw) throw authErr("auth/invalid-credential"); window.__reauthPw = (window.__reauthPw || 0) + 1; if (current) current.metadata = { lastSignInTime: new Date().toUTCString() }; };

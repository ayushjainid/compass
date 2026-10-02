// In-memory stand-in for the Firebase SDK surface Compass uses (test only).
const store = (window.__store = window.__store || JSON.parse(localStorage.getItem("__mockstore") || "{}"));
const save = () => localStorage.setItem("__mockstore", JSON.stringify(store));
const listeners = {};
let authCb = null, current = JSON.parse(localStorage.getItem("__mockuser") || "null");
export const initializeApp = cfg => ({ cfg });
export const getAuth = () => ({ get currentUser() { return current; } });
export class GoogleAuthProvider { setCustomParameters() {} }
export const onAuthStateChanged = (a, cb) => { authCb = cb; setTimeout(() => cb(current), 50); return () => {}; };
export const signInWithPopup = async () => { current = { uid: "u1", displayName: "Ayush Jain", email: "a@example.com", photoURL: "", metadata: { lastSignInTime: new Date(Date.now() - (window.__staleMin || 0) * 60000).toUTCString() } }; localStorage.setItem("__mockuser", JSON.stringify(current)); setTimeout(() => authCb(current), 30); return { user: current }; };
export const signInWithRedirect = async () => {};
export const getRedirectResult = async () => null;
export const signOut = async () => { current = null; localStorage.removeItem("__mockuser"); setTimeout(() => authCb(null), 10); };
export const initializeFirestore = () => ({});
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
export const doc = (fs, ...segs) => ({ path: segs.join("/") });
export const collection = (fs, ...segs) => ({ path: segs.join("/") });
export const where = (f, op, v) => ({ f, op, v });
export const query = (c, w) => ({ c, w });
const snap = path => ({ id: path.split("/").pop(), exists: () => path in store, data: () => store[path] && JSON.parse(JSON.stringify(store[path])) });
export const setDoc = async (r, data, opt) => { const uid = current && current.uid; if (!(r.path.startsWith("users/" + uid + "/") || r.path === "notify/" + uid || r.path === "errors/" + uid || r.path.startsWith("feedback/" + uid + "-") || (uid && /^stats\/[dw]-\d{4}-\d{2}-\d{2}$/.test(r.path) && Object.keys(data).length === 1 && data[Object.keys(data)[0]] && data[Object.keys(data)[0]].__inc === 1))) { const e = new Error("denied"); e.code = "permission-denied"; throw e; } const clean = JSON.parse(JSON.stringify(data)); for (const k in clean) if (clean[k] && clean[k].__inc) { clean[k] = ((store[r.path] || {})[k] || 0) + clean[k].__inc; window.__statWrites = (window.__statWrites || []).concat(r.path + ":" + k); } store[r.path] = opt && opt.merge ? Object.assign(store[r.path] || {}, clean) : clean; save(); (listeners[r.path] || []).forEach(cb => cb(snap(r.path))); };
export const getDoc = async r => { if (navigator.onLine === false && localStorage.getItem("__failOffline")) { const e = new Error("offline"); e.code = "unavailable"; throw e; } return snap(r.path); };
export const onSnapshot = (r, next) => { (listeners[r.path] = listeners[r.path] || []).push(next); setTimeout(() => next(snap(r.path)), 20); return () => { listeners[r.path] = (listeners[r.path] || []).filter(x => x !== next); }; };
export const getDocs = async q => { const base = q.c ? q.c.path : q.path; return { docs: Object.keys(store).filter(k => k.startsWith(base + "/") && (!q.w || store[k][q.w.f] === q.w.v)).map(k => ({ id: k.split("/").pop(), ref: { path: k }, data: () => store[k] })) }; };
export const deleteDoc = async r => { delete store[r.path]; save(); };
export const deleteUser = async () => { current = null; localStorage.removeItem("__mockuser"); setTimeout(() => authCb(null), 10); };
export const reauthenticateWithPopup = async () => { window.__reauth = (window.__reauth || 0) + 1; if (window.__popupBlocked) { const e = new Error("blocked"); e.code = "auth/popup-blocked"; throw e; } if (current) current.metadata = { lastSignInTime: new Date().toUTCString() }; };

export const writeBatch = () => { const ops = []; return { delete: r => ops.push(r), commit: () => window.__hangCommit ? new Promise(() => {}) : (ops.forEach(r => { delete store[r.path]; }), save(), Promise.resolve()) }; };
export const terminate = async () => {};
export const clearIndexedDbPersistence = async () => {};
export const reauthenticateWithRedirect = async () => { window.__reauthRedirect = (window.__reauthRedirect || 0) + 1; };

export const runTransaction = async (fs, fn) => { window.__tx = (window.__tx || 0) + 1;
  if (window.__offline) { const e = new Error("offline"); e.code = "unavailable"; throw e; }
  const writes = [];
  const tx = { get: async r => snap(r.path), set: (r, d) => { writes.push([r.path, JSON.parse(JSON.stringify(d))]); return tx; } };
  const out = await fn(tx);
  writes.forEach(([p, d]) => { store[p] = d; }); save(); writes.forEach(([p]) => (listeners[p] || []).forEach(cb => cb(snap(p))));
  return out;
};
export const initializeAppCheck = (app, o) => { window.__ac = o && o.provider && o.provider.k; return {}; };
export class ReCaptchaEnterpriseProvider { constructor(k) { this.k = k; } }
export const increment = n => ({ __inc: n });

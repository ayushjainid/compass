// Minimal Firestore REST client authenticated with a Google service account (or the emulator).
import { b64uEncode } from "./push.js";

const enc = new TextEncoder();
let tokenCache = null;

function pemToPkcs8(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function accessToken(sa, fetchFn) {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp - now > 300) return tokenCache.t;
  const key = await crypto.subtle.importKey("pkcs8", pemToPkcs8(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const head = b64uEncode(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = b64uEncode(enc.encode(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })));
  const sig = b64uEncode(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(head + "." + claims)));
  const r = await fetchFn("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${sig}` }),
  });
  if (!r.ok) throw new Error("token " + r.status + " " + (await r.text()).slice(0, 200));
  const j = await r.json();
  tokenCache = { t: j.access_token, exp: now + (j.expires_in || 3600) };
  return tokenCache.t;
}

/* ---- value encoding ---- */
export function fromValue(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return Date.parse(v.timestampValue);
  if ("mapValue" in v) return fromFields(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromValue);
  return null;
}
export function fromFields(f) { const o = {}; for (const k in f) o[k] = fromValue(f[k]); return o; }
export function toValue(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (x instanceof Date) return { timestampValue: x.toISOString() };
  if (typeof x === "boolean") return { booleanValue: x };
  if (typeof x === "number") return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === "string") return { stringValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(toValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, toValue(v)])) } };
}

export function client(env, fetchFn = fetch) {
  const emu = env.FIRESTORE_EMULATOR; // e.g. "http://127.0.0.1:8080" for tests
  const sa = emu ? null : JSON.parse(env.FIREBASE_SA);
  const project = env.FIREBASE_PROJECT || (sa && sa.project_id);
  const base = `${emu || "https://firestore.googleapis.com"}/v1/projects/${project}/databases/(default)/documents`;
  const auth = async () => emu ? "Bearer owner" : "Bearer " + await accessToken(sa, fetchFn);
  const call = async (path, body) => {
    const r = await fetchFn(base + path, { method: "POST", headers: { Authorization: await auth(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`firestore ${path} ${r.status} ${(await r.text()).slice(0, 300)}`);
    return r.json();
  };
  return {
    project,
    /** Documents in `collection` whose `field` (a timestamp) is due by `nowMs`, oldest first. */
    async due(collection, field, nowMs, limit) {
      const rows = await call(":runQuery", { structuredQuery: {
        from: [{ collectionId: collection }],
        where: { fieldFilter: { field: { fieldPath: field }, op: "LESS_THAN_OR_EQUAL", value: { timestampValue: new Date(nowMs).toISOString() } } },
        orderBy: [{ field: { fieldPath: field }, direction: "ASCENDING" }],
        limit,
      } });
      return rows.filter(r => r.document).map(r => ({ name: r.document.name, id: r.document.name.split("/").pop(), data: fromFields(r.document.fields || {}) }));
    },
    /** Set fields on one document (creating it if needed), adding `inc` amounts to number fields. */
    async upsert(path, fields, inc = {}) {
      const name = `projects/${project}/databases/(default)/documents/${path}`;
      const write = { update: { name, fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toValue(v)])) }, updateMask: { fieldPaths: Object.keys(fields) } };
      const t = Object.entries(inc).filter(([, n]) => n).map(([k, n]) => ({ fieldPath: k, increment: { integerValue: String(n) } }));
      if (t.length) write.updateTransforms = t;
      await call(":commit", { writes: [write] });
    },
    /** Patch fields on several documents in one atomic commit. */
    async patch(updates) {
      if (!updates.length) return;
      await call(":commit", { writes: updates.map(u => ({
        update: { name: u.name, fields: Object.fromEntries(Object.entries(u.fields).map(([k, v]) => [k, toValue(v)])) },
        updateMask: { fieldPaths: Object.keys(u.fields) },
        currentDocument: { exists: true },
      })) });
    },
  };
}

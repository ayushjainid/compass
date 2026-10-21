// Web Push with only WebCrypto (works in Cloudflare Workers and Node 20+).
// Payload encryption: RFC 8291 (aes128gcm). Sender identity: VAPID, RFC 8292.

const enc = new TextEncoder();

export function b64uDecode(s) {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
/** The push service's reason for refusing (Apple sends {"reason":"BadJwtToken"}; others plain text). */
export async function refusal(res) {
  let txt = ""; try { txt = await res.text(); } catch (e) {}
  try { const j = JSON.parse(txt); if (j && (j.reason || j.message || j.error)) return String(j.reason || j.message || (j.error && j.error.message) || j.error).slice(0, 80); } catch (e) {}
  return txt.replace(/\s+/g, " ").trim().slice(0, 80);
}
export function b64uEncode(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concat(...parts) {
  const n = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** Encrypt `payload` (string) for one subscription. Returns the request body bytes. */
export async function encryptPayload(sub, payload) {
  const uaPublic = b64uDecode(sub.keys.p256dh), authSecret = b64uDecode(sub.keys.auth);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plain = concat(enc.encode(payload), new Uint8Array([2])); // single, final record
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, plain));
  const rs = 4096, header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

/** Import a VAPID key pair given as base64url raw keys (65-byte public, 32-byte private). */
export async function importVapid(publicB64u, privateB64u) {
  const pub = b64uDecode(publicB64u);
  const jwk = { kty: "EC", crv: "P-256", x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33, 65)), d: privateB64u, ext: true };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return { key, publicB64u };
}

/** Does the private key belong to the public key? Sign with one, check with the other. A mismatch means every
    push is refused (Apple: BadJwtToken), so the Worker reports it instead of failing quietly. */
export async function vapidPairOk(vapid) {
  try {
    const pubKey = await crypto.subtle.importKey("raw", b64uDecode(vapid.publicB64u), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const data = enc.encode("compass-key-check"), sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, vapid.key, data);
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pubKey, sig, data);
  } catch (e) { return false; }
}

/* Apple asks senders not to make a new signed token more than once an hour. Workers start fresh often, so
   tokens are also kept in `store` (saved by the caller between runs) and reused until an hour before expiry. */
const jwtCache = new Map();
export const _resetJwtCache = () => jwtCache.clear();   // tests: a fresh Worker instance
export const jwtKey = aud => aud.replace(/^https?:\/\//, "").replace(/[^A-Za-z0-9]/g, "_");
async function vapidHeader(vapid, endpoint, subject, store) {
  const aud = new URL(endpoint).origin, now = Math.floor(Date.now() / 1000);
  const fresh = x => x && x.h && x.k === vapid.publicB64u && x.exp - now > 3600;
  let hit = jwtCache.get(aud);
  if (!fresh(hit) && store) { const x = store.get(jwtKey(aud)); if (fresh(x)) { hit = x; jwtCache.set(aud, x); } }
  if (fresh(hit)) return hit.h;
  const exp = now + 12 * 3600;
  const head = b64uEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64uEncode(enc.encode(JSON.stringify({ aud, exp, sub: subject })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, vapid.key, enc.encode(head + "." + body));
  const h = `vapid t=${head}.${body}.${b64uEncode(sig)}, k=${vapid.publicB64u}`;
  const rec = { h, exp, k: vapid.publicB64u };
  jwtCache.set(aud, rec); if (store) store.set(jwtKey(aud), rec);
  return h;
}

/** Build the fetch() arguments for one push. */
export async function pushRequest(sub, payload, vapid, { subject = "mailto:hello@life-compass.web.app", ttl = 3600, topic = "", store = null } = {}) {
  const body = await encryptPayload(sub, JSON.stringify(payload));
  const headers = {
    "Content-Type": "application/octet-stream",
    "Content-Encoding": "aes128gcm",
    TTL: String(ttl),
    Urgency: "normal",
    Authorization: await vapidHeader(vapid, sub.endpoint, subject, store),
  };
  /* Topic: at most 32 characters of the URL-safe base64 alphabet, or Apple refuses the push (BadWebPushTopic) */
  const t = String(topic || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
  if (t) headers.Topic = t;
  return [sub.endpoint, { method: "POST", headers, body }];
}

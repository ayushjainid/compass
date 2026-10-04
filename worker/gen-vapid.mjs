// Makes a VAPID key pair for Web Push.
// The public key is written into ../public/firebase-config.js and wrangler.toml.
// The private key is printed once: store it with `npx wrangler secret put VAPID_PRIVATE`.
import { readFileSync, writeFileSync } from "node:fs";
const b64u = b => Buffer.from(b).toString("base64url");
const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
const pub = b64u(await crypto.subtle.exportKey("raw", kp.publicKey));
const priv = (await crypto.subtle.exportKey("jwk", kp.privateKey)).d;
const cfg = new URL("../public/firebase-config.js", import.meta.url);
let c = readFileSync(cfg, "utf8");
c = /COMPASS_VAPID_PUBLIC\s*=/.test(c) ? c.replace(/(?:window|self)\.COMPASS_VAPID_PUBLIC\s*=\s*"[^"]*"/, `self.COMPASS_VAPID_PUBLIC = "${pub}"`) : c.trimEnd() + `\nself.COMPASS_VAPID_PUBLIC = "${pub}";\n`;
writeFileSync(cfg, c);
const wr = new URL("./wrangler.toml", import.meta.url);
writeFileSync(wr, readFileSync(wr, "utf8").replace(/VAPID_PUBLIC = "[^"]*"/, `VAPID_PUBLIC = "${pub}"`));
console.log("Public key saved to public/firebase-config.js and worker/wrangler.toml.\n");
console.log("Private key (store it now, it is not saved anywhere):\n\n  " + priv + "\n");
console.log("Next:  npx wrangler secret put VAPID_PRIVATE   and paste the line above.");

// Push keys: a device subscribes with the key the reminders service actually signs with (from its /health), a
// subscription made with another key is replaced on its own (Apple refuses those: VapidPkHashMismatch), and a refused
// test offers "Reconnect this device".
const { chromium } = require('./engine'); const fs = require('fs'), path = require('path');
const { launch, report, W } = require('./harness');
const root = path.join(__dirname, '../../public');
const R = []; const ok = (n, c, i) => R.push({ n, pass: !!c, i: c ? undefined : i });
const key = n => Buffer.concat([Buffer.from([4]), Buffer.alloc(64, n)]).toString('base64url');
const K1 = key(1), K2 = key(2);   // the app's key, the Worker's key (65-byte P-256 points)
const fakePush = `(() => {
  window.__unsub = 0; window.__subs = 0;
  window.Notification = class { static get permission() { return "granted"; } static async requestPermission() { return "granted"; } };
  window.PushManager = function () {};
  const b64 = a => btoa(String.fromCharCode(...new Uint8Array(a))).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
  const unb64 = s => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer; };
  const mk = (ep, key) => ({ endpoint: ep, options: { applicationServerKey: unb64(key) }, toJSON() { return { endpoint: this.endpoint, keys: { p256dh: "BPk", auth: "au" } }; }, unsubscribe: async () => { window.__unsub++; sub = null; localStorage.removeItem("__fakeSub"); return true; } });
  const saved = JSON.parse(localStorage.getItem("__fakeSub") || "null");
  let sub = saved ? mk(saved.ep, saved.key) : null;
  const pm = { getSubscription: async () => sub, subscribe: async o => { window.__subs++; const key = b64(o.applicationServerKey); const n = +(localStorage.getItem("__fakeSubN") || 0) + 1; localStorage.setItem("__fakeSubN", n); sub = mk("https://web.push.apple.com/dev" + n, key); localStorage.setItem("__fakeSub", JSON.stringify({ ep: sub.endpoint, key })); window.__lastKey = key; return sub; } };
  const reg = { pushManager: pm, showNotification: async () => {} };
  Object.defineProperty(navigator, "serviceWorker", { value: { register: async () => reg, ready: Promise.resolve(reg), getRegistration: async () => reg, addEventListener() {} }, configurable: true });
})()`;
(async () => { const b = await launch(chromium);
  let health = { ok: true, version: 't', key: K2, keyOk: true };
  const ctx = await b.newContext({ viewport: { width: W, height: 844 } });
  await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort());
  await ctx.route('https://worker.test/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(health) }));
  await ctx.route('http://compass.test/**', async route => { const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type;
    if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; }
    else if (p === '/firebase-config.js') { body = `self.COMPASS_FIREBASE_CONFIG={apiKey:"t",authDomain:"x",projectId:"x",appId:"x"};self.COMPASS_VAPID_PUBLIC="${K1}";self.COMPASS_WORKER_URL="https://worker.test";`; type = 'text/javascript'; }
    else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
    route.fulfill({ status: 200, body, contentType: type }); });
  await ctx.addInitScript(fakePush);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const tap = async s => { const l = p.locator(s).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click(); await p.waitForTimeout(300); };
  const store = () => p.evaluate(() => JSON.parse(localStorage.getItem('__mockstore') || '{}'));
  const dev = () => p.evaluate(() => localStorage.getItem('compass-device'));
  // a device that signed up long ago with the app's key, and reminders on
  await p.goto('http://compass.test/'); await p.waitForTimeout(400);
  await p.evaluate(k => localStorage.setItem('__fakeSub', JSON.stringify({ ep: 'https://web.push.apple.com/old', key: k })), K1);
  await p.reload(); await p.waitForTimeout(500);
  await tap('.lhero [data-act=signin]'); await p.waitForTimeout(600);
  await tap('[data-act=obNext]'); for (const v of ['rel', 'body']) await tap(`[data-act=obValue][data-v=${v}]`);
  while (await p.locator('[data-act=obNext]').count()) await tap('[data-act=obNext]');
  await p.waitForTimeout(600); await tap('[data-act=introDone]').catch(() => {});
  const d = await dev();
  await p.evaluate(([d, ep]) => { const st = window.__store; st['notify/u1'] = { on: true, tz: 'UTC', eve: '21:00', subs: { [d]: { endpoint: ep, keys: { p256dh: 'x', auth: 'y' }, dev: 'iPhone · Home Screen app', at: 1 } } }; localStorage.setItem('__mockstore', JSON.stringify(st)); }, [d, 'https://web.push.apple.com/old']);
  await p.evaluate(k => { localStorage.setItem('__fakeSubN', '0'); localStorage.setItem('__fakeSub', JSON.stringify({ ep: 'https://web.push.apple.com/old', key: k })); }, K1);
  await p.reload(); await p.waitForTimeout(2500);
  let st = await store();
  ok('a subscription made with a key the service doesn\'t use is replaced on its own', await p.evaluate(() => window.__unsub) === 1 && await p.evaluate(() => window.__lastKey) === K2, { unsub: await p.evaluate(() => window.__unsub), key: (await p.evaluate(() => window.__lastKey) || '').slice(0, 4) });
  ok('…and the new address is saved for this device', (st['notify/u1'].subs[d] || {}).endpoint === 'https://web.push.apple.com/dev1', st['notify/u1'].subs);
  await p.reload(); await p.waitForTimeout(2000);
  ok('once it matches, it is left alone', await p.evaluate(() => window.__unsub) === 0 && await p.evaluate(() => window.__subs) === 0);
  // a test the push service refused for this device: one tap reconnects
  await tap('[data-act=tab][data-t=compass]'); await tap('[data-act=cSec][data-k=remind]');
  await tap('[data-act=ntTest]');
  await p.evaluate(d => { const st = window.__store; st['notify/u1'].test = { at: Date.now() + 1000, res: [{ d, dev: 'iPhone · Home Screen app', ok: false, s: 403, r: 'VapidPkHashMismatch' }] }; }, d);
  await p.waitForTimeout(3000);
  const txt = await p.locator('.nttest').innerText();
  ok('a refused test says why, in plain words, with a way to fix it', /signed up with a different key/.test(txt) && await p.locator('.nttest [data-act=ntFix][data-force="1"]').count() === 1, txt);
  await tap('.nttest [data-act=ntFix]'); await p.waitForTimeout(800);
  st = await store();
  ok('Reconnect makes a fresh address with the right key', await p.evaluate(() => window.__unsub) === 1 && await p.evaluate(() => window.__lastKey) === K2 && (st['notify/u1'].subs[d] || {}).endpoint === 'https://web.push.apple.com/dev2', st['notify/u1'].subs);
  // a Worker whose keys don't pair: the app keeps the key in its own config
  health = { ok: true, key: K2, keyOk: false };
  await p.evaluate(() => localStorage.removeItem('compass-wh'));
  await p.reload(); await p.waitForTimeout(2000);
  ok('a Worker with a broken key pair isn\'t trusted: back to the app\'s own key', await p.evaluate(() => window.__lastKey) === K1);
  ok('no page errors', !errs.length, errs);
  report(`pushkey ${W}`, R);
  await b.close();
})().catch(e => { console.log('CRASH', e.message.split('\n').slice(0, 4).join(' | ')); report('pushkey', R); process.exit(1); });

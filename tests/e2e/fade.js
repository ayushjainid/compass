// Reminders in the app: turn on/off, times, activity, review, iOS hint, deep link, deletion
const { chromium, devices } = require('playwright'); const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../public'), S = process.env.S;
const W = +(process.env.W || 390), H = +(process.env.H || 844), touch = process.env.T !== '0';
const results = []; const ok = (n, c, i) => results.push({ n, pass: !!c, i: c ? undefined : i });
const VAPID = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
const fakePush = (perm) => `(() => {
  window.__perm = ${JSON.stringify(perm)}; window.__unsub = 0; window.__subs = 0;
  window.Notification = class { static get permission() { return window.__permState || "default"; } static async requestPermission() { window.__permState = window.__perm; return window.__perm; } };
  window.PushManager = function () {};
  let sub = null;
  const pm = { getSubscription: async () => sub, subscribe: async o => { window.__subs++; window.__key = o.applicationServerKey && o.applicationServerKey.length; sub = { endpoint: "https://fcm.googleapis.com/fcm/send/xyz" + window.__subs, toJSON() { return { endpoint: this.endpoint, keys: { p256dh: "BPk", auth: "au" } }; }, unsubscribe: async () => { window.__unsub++; sub = null; return true; } }; return sub; } };
  const reg = { pushManager: pm, showNotification: async (t, o) => { window.__shown = t; } };
  Object.defineProperty(navigator, "serviceWorker", { value: { register: async u => { window.__swurl = u; return reg; }, ready: Promise.resolve(reg), getRegistration: async () => reg, addEventListener() {} }, configurable: true });
})()`;
async function setup(b, { perm = 'granted', ua, vapid = VAPID, url = 'http://compass.test/' } = {}) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, colorScheme: 'dark', deviceScaleFactor: 2, ...(ua ? { userAgent: ua } : {}) });
  await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort()); await ctx.route('http://compass.test/**', async route => { const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type;
    if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; } else if (p === '/firebase-config.js') { body = `window.COMPASS_FIREBASE_CONFIG={apiKey:"t",authDomain:"x",projectId:"x",appId:"x"};window.COMPASS_VAPID_PUBLIC=${JSON.stringify(vapid)};`; type = 'text/javascript'; } else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
    route.fulfill({ status: 200, body, contentType: type }); });
  await ctx.addInitScript(fakePush(perm));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const tap = async s => { const l = typeof s === 'string' ? p.locator(s).first() : s; await l.scrollIntoViewIfNeeded().catch(()=>{}); touch ? await l.tap() : await l.click(); await p.waitForTimeout(250); };
  await p.goto(url); await p.waitForTimeout(500); await tap('.lhero [data-act=signin]'); await p.waitForTimeout(600);
  await tap('[data-act=obNext]'); for (const v of ['rel', 'body']) await tap(`[data-act=obValue][data-v=${v}]`);
  while (await p.locator('[data-act=obNext]').count()) await tap('[data-act=obNext]');
  await p.waitForTimeout(600);
  return { ctx, p, errs, tap };
}
const nt = p => p.evaluate(() => JSON.parse(localStorage.getItem('__mockstore') || '{}')['notify/u1']);
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const seed = (p, activeOf28) => p.evaluate(n => {
    const st = JSON.parse(localStorage.getItem('__mockstore')); const pad = x => String(x).padStart(2, '0'), k = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const t = new Date(); t.setHours(0, 0, 0, 0);
    for (let i = 1; i <= 28; i++) { const d = new Date(t); d.setDate(d.getDate() - i); const m = new Date(d); m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
      const key = 'users/u1/docs/w-' + k(m); st[key] = st[key] || { kind: 'week', start: k(m), days: {}, c: {}, r: {} };
      st[key].days[k(d)] = i <= n ? { a: { reach: true }, j: {} } : { a: {}, j: {} }; }
    const s0 = new Date(t); s0.setDate(s0.getDate() - 40); st['users/u1/docs/profile'].onboardedAt = k(s0);
    localStorage.setItem('__mockstore', JSON.stringify(st)); Object.keys(localStorage).filter(x => x.startsWith('compass:u1:')).forEach(x => localStorage.removeItem(x));
  }, activeOf28);
  { const { ctx, p, errs, tap } = await setup(b);
    await seed(p, 26); await p.reload(); await p.waitForTimeout(1800);
    await tap('[data-act=tab][data-t=review]');
    ok('steady for 4 weeks: Review offers to drop the evening nudge', /checked in 26 of the last 28 days/.test(await p.locator('.fade').innerText().catch(() => '')));
    await p.screenshot({ path: `${S}/fade-${W}.png` });
    await tap('[data-act=fadeNo]'); await p.waitForTimeout(400);
    let d = await nt(p);
    ok('Keep both hides it for 8 weeks and remembers', await p.locator('.fade').count() === 0 && d.fadeAsk && d.eve === '21:30');
    await p.evaluate(() => { const st = JSON.parse(localStorage.getItem('__mockstore')); delete st['notify/u1'].fadeAsk; localStorage.setItem('__mockstore', JSON.stringify(st)); });
    await p.reload(); await p.waitForTimeout(1800); await tap('[data-act=tab][data-t=review]');
    await tap('[data-act=fadeYes]'); await p.waitForTimeout(400); d = await nt(p);
    ok('Sunday only turns the evening nudge off and keeps Sunday', d.eve === '' && d.nextEve === null && d.rev === '18:00' && d.on === true, d);
    ok('…and the card is gone', await p.locator('.fade').count() === 0);
    ok('no page errors', errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs, tap } = await setup(b);
    await seed(p, 15); await p.reload(); await p.waitForTimeout(1800); await tap('[data-act=tab][data-t=review]');
    ok('patchy month: no suggestion', await p.locator('.fade').count() === 0);
    ok('no page errors (patchy)', errs.length === 0, errs); await ctx.close(); }
  const f = results.filter(r => !r.pass); console.log(`fade ${W}: ${results.length - f.length}/${results.length} passed`); f.forEach(x => console.log('  FAIL', x.n, JSON.stringify(x.i || '').slice(0, 400)));
  await b.close(); })().catch(e => { console.log('CRASH', e.message.split('\n')[0]); process.exit(1); });

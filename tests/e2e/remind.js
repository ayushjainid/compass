// Reminders in the app: turn on/off, times, activity, review, iOS hint, deep link, deletion
const { chromium } = require('./engine'); const { devices } = require('playwright'); const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../public'), S = process.env.S;
const W = +(process.env.W || 390), H = +(process.env.H || 844), touch = process.env.T !== '0';
const results = []; const ok = (n, c, i) => results.push({ n, pass: !!c, i: c ? undefined : i });
const VAPID = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
const fakePush = (perm) => `(() => {
  window.__perm = ${JSON.stringify(perm)}; window.__unsub = 0; window.__subs = 0;
  /* like a real browser, the answer is remembered across reloads */
  window.Notification = class { static get permission() { return window.__permState || localStorage.getItem("__permState") || "default"; } static async requestPermission() { window.__permState = window.__perm; localStorage.setItem("__permState", window.__perm); return window.__perm; } };
  window.PushManager = function () {};
  /* the browser keeps a push subscription across reloads */
  const mk = ep => ({ endpoint: ep, toJSON() { return { endpoint: this.endpoint, keys: { p256dh: "BPk", auth: "au" } }; }, unsubscribe: async () => { window.__unsub++; sub = null; localStorage.removeItem("__fakeSub"); return true; } });
  let sub = localStorage.getItem("__fakeSub") ? mk(localStorage.getItem("__fakeSub")) : null;
  const pm = { getSubscription: async () => sub, subscribe: async o => { if (localStorage.getItem("__gestureOnly") && !(Date.now() - (window.__lastTap || 0) < 1500)) { const e = new Error("needs a tap"); e.name = "NotAllowedError"; throw e; } window.__subs++; window.__key = o.applicationServerKey && o.applicationServerKey.length; const n = +(localStorage.getItem("__fakeSubN") || 0) + 1; localStorage.setItem("__fakeSubN", n); sub = mk("https://fcm.googleapis.com/fcm/send/xyz" + n); localStorage.setItem("__fakeSub", sub.endpoint); return sub; } };
  addEventListener("click", () => { window.__lastTap = Date.now(); }, true); addEventListener("touchend", () => { window.__lastTap = Date.now(); }, true);
  const reg = { pushManager: pm, showNotification: async (t, o) => { window.__shown = t; } };
  Object.defineProperty(navigator, "serviceWorker", { value: { register: async u => { window.__swurl = u; return reg; }, ready: Promise.resolve(reg), getRegistration: async () => reg, addEventListener() {} }, configurable: true });
})()`;
async function setup(b, { perm = 'granted', ua, vapid = VAPID, url = 'http://compass.test/', standalone = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, colorScheme: 'dark', deviceScaleFactor: 2, ...(ua ? { userAgent: ua } : {}) });
  await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort()); await ctx.route('http://compass.test/**', async route => { const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type;
    if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; } else if (p === '/firebase-config.js') { body = `window.COMPASS_FIREBASE_CONFIG={apiKey:"t",authDomain:"x",projectId:"x",appId:"x"};window.COMPASS_VAPID_PUBLIC=${JSON.stringify(vapid)};`; type = 'text/javascript'; } else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
    route.fulfill({ status: 200, body, contentType: type }); });
  await ctx.addInitScript(fakePush(perm));
  /* opened from the Home Screen icon: iOS reports navigator.standalone and display-mode: standalone */
  if (standalone) await ctx.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }); const mm = window.matchMedia.bind(window); window.matchMedia = q => /display-mode:\s*standalone/.test(q) ? { matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } } : mm(q); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const tap = async s => { const l = typeof s === 'string' ? p.locator(s).first() : s; await l.scrollIntoViewIfNeeded().catch(()=>{}); touch ? await l.tap() : await l.click(); await p.waitForTimeout(250); };
  await p.goto(url); await p.waitForTimeout(500); await tap('.lhero [data-act=signin]'); await p.waitForTimeout(600);
  await tap('[data-act=obNext]'); for (const v of ['rel', 'body']) await tap(`[data-act=obValue][data-v=${v}]`);
  while (await p.locator('[data-act=obNext]').count()) await tap('[data-act=obNext]');
  await p.waitForTimeout(600);
  return { ctx, p, errs, tap };
}
const nt = p => p.evaluate(() => JSON.parse(localStorage.getItem('__mockstore') || '{}')['notify/u1']);
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, channel: process.env.CHROMIUM ? undefined : 'chromium' });
  { const { ctx, p, errs, tap } = await setup(b);
    let d = await nt(p);
    ok('finishing setup asks once and turns reminders on by default', d && d.on && d.optOut === false && await p.evaluate(() => window.__subs) === 1, d);
    ok('no ask card when already on', await p.locator('.ntask').count() === 0);
    await tap('[data-act=tab][data-t=compass]');
    await tap('[data-act=cSec][data-k=remind]');
    const now = Date.now();
    ok('turning on saves this device and the schedule', d && d.on && d.sub && d.sub.endpoint && d.eve === '21:30' && d.rev === '18:00' && d.tz && d.last && d.ign === 0, d);
    ok('next check-in is tonight or tomorrow at 9:30 pm local', d && Date.parse(d.nextEve) > now && Date.parse(d.nextEve) - now <= 864e5 && new Date(d.nextEve).getHours() === 21 && new Date(d.nextEve).getMinutes() === 30, d && d.nextEve);
    ok('next review is a Sunday at 6 pm', d && new Date(d.nextRev).getDay() === 0 && new Date(d.nextRev).getHours() === 18, d && d.nextRev);
    ok('subscribed with the app key', await p.evaluate(() => window.__key) === 65 && await p.evaluate(() => window.__swurl) === '/sw.js');
    ok('summary shows the times', /Check-in 9:30 pm · Sunday review 6 pm/.test(await p.locator('#csec-remind .cst small').innerText()));
    await p.screenshot({ path: `${S}/remind-on-${W}.png`, fullPage: false });
    await p.fill('#nt-eve', '22:15'); await p.locator('#nt-eve').dispatchEvent('change'); await p.waitForTimeout(400);
    d = await nt(p);
    ok('changing the time reschedules', d.eve === '22:15' && new Date(d.nextEve).getHours() === 22 && new Date(d.nextEve).getMinutes() === 15, d);
    await tap('[data-act=ntToggle][data-k=eve]'); d = await nt(p);
    ok('evening off clears its schedule, review stays', d.eve === '' && d.nextEve === null && d.rev === '18:00' && d.nextRev, d);
    await tap('[data-act=ntToggle][data-k=eve]'); d = await nt(p);
    ok('evening back on uses the default time', d.eve === '21:30' && d.nextEve);
    ok("'Say what's left' is on by default", (await p.locator('[data-act=ntNames]').getAttribute('aria-checked')) === 'true');
    await tap('[data-act=ntNames]'); await p.waitForTimeout(300); d = await nt(p);
    ok("turning it off keeps names off the lock screen", d.names === false && (await p.locator('[data-act=ntNames]').getAttribute('aria-checked')) === 'false', d);
    await tap('[data-act=ntNames]'); await p.waitForTimeout(300); d = await nt(p);
    ok("…and back on", d.names === true, d);
    // devices: this one is listed; a second device's address is kept apart, never overwritten
    const DEV = await p.evaluate(() => localStorage.getItem('compass-device'));
    d = await nt(p);
    ok('this device is saved under its own key with a readable name', d.subs && d.subs[DEV] && d.subs[DEV].endpoint === d.sub.endpoint && /Chrome|Safari|Firefox|Edge|iPhone|Android/.test(d.subs[DEV].dev || ''), d.subs);
    ok('the device list says which one this is', /This one/i.test(await p.locator('#csec-remind .ntdevs').innerText()));
    await p.evaluate(() => { const n = window.__store['notify/u1']; n.subs.ipad = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'X', auth: 'Y' }, dev: 'iPhone · Home Screen app', at: 1 }; n.sub = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'X', auth: 'Y' } }; localStorage.setItem('__mockstore', JSON.stringify(window.__store)); });
    await p.reload(); await p.waitForTimeout(1500); d = await nt(p);
    ok('opening Compass on a laptop no longer steals the iPhone\'s reminders', d.sub.endpoint === 'https://web.push.apple.com/abc' && d.subs.ipad && d.subs[DEV], d);
    await tap('[data-act=tab][data-t=compass]'); if (!(await p.locator('[data-act=ntTest]').count())) await tap('[data-act=cSec][data-k=remind]');
    ok('both devices are listed', /iPhone · Home Screen app/.test(await p.locator('#csec-remind .ntdevs').innerText()) && await p.locator('#csec-remind [data-act=ntDrop]').count() === 2);
    // a real test: asks the reminders service, then shows what each push service said
    await tap('[data-act=ntTest]'); await p.waitForTimeout(300); d = await nt(p);
    ok('Send a test asks the reminders service to send one now', d.nextTest && Math.abs(Date.parse(d.nextTest) - Date.now()) < 60000 && d.test === null, d.nextTest);
    ok('…and shows it is sending', /Sending a real test/.test(await p.locator('#csec-remind').innerText()));
    await p.evaluate(dev => { window.__store['notify/u1'].test = { at: new Date().toISOString(), res: [{ d: dev, dev: 'Linux · Chrome', ok: true, s: 201 }, { d: 'ipad', dev: 'iPhone · Home Screen app', ok: false, s: 403, r: 'BadJwtToken' }] }; window.__store['notify/u1'].nextTest = null; }, DEV);
    await p.waitForFunction(() => /didn't go through/.test(document.querySelector('#csec-remind').innerText), null, { timeout: 12000 }).catch(() => {});
    const tt = await p.locator('#csec-remind .nttest').innerText().catch(() => '');
    ok('the result names each device and why one was refused', /this one/.test(tt) && /accepted/.test(tt) && /iPhone · Home Screen app/.test(tt) && /signature was refused/.test(tt), tt);
    await p.screenshot({ path: `${S}/remind-test-${W}.png` });
    await tap('#csec-remind [data-act=ntDrop][data-k=ipad]'); await p.waitForTimeout(300); d = await nt(p);
    ok('removing a device drops only it (and hands the old single address to a device still on)', !d.subs.ipad && d.subs[DEV] && d.sub.endpoint === d.subs[DEV].endpoint, d);
    // the reminders service found this device's address gone: Today offers a one-tap reconnect
    await p.evaluate(dev => { const n = window.__store['notify/u1']; delete n.subs[dev]; n.lost = { [dev]: true }; localStorage.setItem('__mockstore', JSON.stringify(window.__store)); }, DEV);
    await p.reload(); await p.waitForTimeout(1500); await tap('[data-act=tab][data-t=today]');
    ok('a device that stopped receiving offers to reconnect', await p.locator('.ntask [data-act=ntFix]').count() === 1 && /stopped reaching/.test(await p.locator('.ntask').innerText()), { nt: await nt(p), today: (await p.locator('#main').innerText()).slice(0, 300) });
    const unsub0 = await p.evaluate(() => window.__unsub), subs0 = await p.evaluate(() => window.__subs);
    await tap('.ntask [data-act=ntFix]'); await p.waitForTimeout(500); d = await nt(p);
    ok('Reconnect drops the dead address and signs up again', await p.evaluate(() => window.__unsub) === unsub0 + 1 && await p.evaluate(() => window.__subs) === subs0 + 1 && d.subs[DEV] && !(d.lost || {})[DEV] && await p.locator('.ntask').count() === 0, d);
    // review done this week → revDone
    await tap('[data-act=tab][data-t=review]'); await tap('[data-act=reviewDone]'); await p.waitForTimeout(400);
    d = await nt(p);
    const mon = await p.evaluate(() => { const x = new Date(); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); });
    ok('finishing the review tells the Worker to skip Sunday', d.revDone === mon, d.revDone);
    // activity resets: pretend yesterday + ignored streak, then reopen
    await p.evaluate(() => { const st = JSON.parse(localStorage.getItem('__mockstore')); st['notify/u1'].last = '2020-01-01'; st['notify/u1'].ign = 4; localStorage.setItem('__mockstore', JSON.stringify(st)); });
    await p.reload(); await p.waitForTimeout(1500);
    d = await nt(p);
    ok('opening Compass marks today active and resets the ignored count', d.last !== '2020-01-01' && d.ign === 0, d);
    ok('still on after reload without asking again', d.on && await p.evaluate(() => window.__subs) === 0);
    // turn off
    await tap('[data-act=tab][data-t=compass]'); if (!(await p.locator('[data-act=ntOff]').count())) await tap('[data-act=cSec][data-k=remind]');
    await tap('[data-act=ntOff]'); await p.waitForTimeout(400); d = await nt(p);
    ok('turning off unsubscribes, stops the schedule and remembers the choice', d.on === false && d.optOut === true && d.sub === null && !d.subs && d.nextEve === null && d.nextRev === null, d);
    await p.reload(); await p.waitForTimeout(1500); d = await nt(p);
    ok('turned off stays off after reload (no silent re-enable)', d.on === false && d.optOut === true);
    await tap('[data-act=tab][data-t=today]');
    ok('no ask card after opting out', await p.locator('.ntask').count() === 0);
    // on again, then delete account removes the doc
    await tap('[data-act=tab][data-t=compass]'); if (!(await p.locator('[data-act=ntOn]').count())) await tap('[data-act=cSec][data-k=remind]');
    await tap('[data-act=ntOn]'); await p.waitForTimeout(500);
    await tap('#acctBtn'); await tap('[data-act=delAcct]'); await tap('[data-act=delAcctYes]');
    await p.waitForFunction(() => !localStorage.getItem('__mockuser'), null, { timeout: 15000 }).catch(() => {});
    ok('deleting the account removes reminder settings', !(await p.evaluate(() => 'notify/u1' in JSON.parse(localStorage.getItem('__mockstore') || '{}'))));
    ok('no page errors', errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs, tap } = await setup(b, { perm: 'denied' });
    await tap('[data-act=tab][data-t=compass]'); await tap('[data-act=cSec][data-k=remind]'); await p.waitForTimeout(300);
    ok('blocked permission explains how to allow it', /blocked for Compass/.test(await p.locator('#csec-remind').innerText()) && !(await nt(p)));
    ok('no page errors (denied)', errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs, tap } = await setup(b, { perm: 'default' });
    await tap('[data-act=introDone]').catch(() => {});
    ok('if the first ask was dismissed, Today shows a friendly card', await p.locator('.ntask [data-act=ntOn]').count() === 1);
    await p.screenshot({ path: `${S}/ntask-${W}.png` });
    await tap('.ntask [data-act=ntLater]');
    ok('Not now hides it', await p.locator('.ntask').count() === 0);
    await p.evaluate(() => localStorage.removeItem('compass-ntask')); await p.reload(); await p.waitForTimeout(1500);
    ok('it comes back later', await p.locator('.ntask').count() === 1);
    await tap('.ntask [data-act=ntOptOut]'); await p.waitForTimeout(300);
    ok('Turn off in the card opts out for good', (await nt(p)).optOut === true && await p.locator('.ntask').count() === 0);
    await p.evaluate(() => { window.__perm = 'granted'; });
    await tap('[data-act=tab][data-t=compass]'); await tap('[data-act=cSec][data-k=remind]');
    ok('Compass → Reminders shows Off with a way back on', /Off/.test(await p.locator('#csec-remind .cst small').innerText()) && await p.locator('#csec-remind [data-act=ntOn]').count() === 1);
    ok('no page errors (default)', errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs, tap } = await setup(b, { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
    await tap('[data-act=tab][data-t=compass]'); await tap('[data-act=cSec][data-k=remind]');
    ok('iPhone in Safari: asks to add to Home Screen first', /Add to Home Screen/.test(await p.locator('#csec-remind').innerText()) && await p.locator('[data-act=ntOn]').count() === 0);
    await p.screenshot({ path: `${S}/remind-ios-${W}.png` });
    ok('no page errors (iOS)', errs.length === 0, errs); await ctx.close(); }
  { const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    const { ctx, p, errs, tap } = await setup(b, { ua: IOS, standalone: true });
    const d = await nt(p);
    ok('iPhone from the Home Screen: setup turns reminders on like any phone', d && d.on && d.sub && d.sub.endpoint && d.eve === '21:30', d);
    await tap('[data-act=tab][data-t=compass]'); if (!(await p.locator('[data-act=ntToggle]').count())) await tap('[data-act=cSec][data-k=remind]');
    ok('iPhone from the Home Screen: full reminder settings, no Add-to-Home-Screen advice', await p.locator('#csec-remind [data-act=ntToggle]').count() === 2 && !/Add to Home Screen/.test(await p.locator('#csec-remind').innerText()));
    ok('iPhone: the lock-screen names toggle is there', await p.locator('#csec-remind [data-act=ntNames]').count() === 1);
    // Safari dropped the subscription and only lets a tap make a new one: Today asks for that tap
    await p.evaluate(() => { localStorage.removeItem('__fakeSub'); localStorage.setItem('__gestureOnly', '1'); });
    await p.reload(); await p.waitForTimeout(1500); await tap('[data-act=tab][data-t=today]');
    ok('iPhone: lost subscription that needs a tap shows Reconnect', await p.locator('.ntask [data-act=ntFix]').count() === 1, (await p.locator('#main').innerText()).slice(0, 200));
    await tap('.ntask [data-act=ntFix]'); await p.waitForTimeout(500);
    const d2 = await nt(p), dev = await p.evaluate(() => localStorage.getItem('compass-device'));
    ok('iPhone: one tap reconnects and labels the device', d2.subs && d2.subs[dev] && d2.subs[dev].dev === 'iPhone · Home Screen app' && await p.locator('.ntask').count() === 0, d2.subs);
    ok('no page errors (iOS installed)', errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs, tap } = await setup(b, { vapid: '' });
    await tap('[data-act=tab][data-t=compass]');
    ok('no key configured: no Reminders section', await p.locator('#csec-remind').count() === 0);
    ok('no page errors (no key)', errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs, tap } = await setup(b);
    await p.goto('http://compass.test/?tab=review&from=review'); await p.waitForTimeout(1500);
    ok('opening from a review reminder lands on Review', await p.locator('[data-act=tab][data-t=review][aria-selected=true]').count() === 1 && !/tab=/.test(p.url()), p.url());
    ok('no page errors (deep link)', errs.length === 0, errs); await ctx.close(); }
  const f = results.filter(r => !r.pass); console.log(`remind ${W}: ${results.length - f.length}/${results.length} passed`); f.forEach(x => console.log('  FAIL', x.n, JSON.stringify(x.i || '').slice(0, 400)));
  await b.close(); })().catch(e => { console.log('CRASH', e.message.split('\n')[0]); results.filter(r => !r.pass).forEach(x => console.log('  FAIL', x.n, JSON.stringify(x.i || '').slice(0, 300))); process.exit(1); });

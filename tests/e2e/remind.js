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
    await tap('[data-act=ntTest]');
    ok('test notification shows', await p.evaluate(() => window.__shown) === "Psst, it's your compass");
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
    ok('still on after reload without asking again', d.on && await p.evaluate(() => window.__subs) <= 1);
    // turn off
    await tap('[data-act=tab][data-t=compass]'); if (!(await p.locator('[data-act=ntOff]').count())) await tap('[data-act=cSec][data-k=remind]');
    await tap('[data-act=ntOff]'); await p.waitForTimeout(400); d = await nt(p);
    ok('turning off unsubscribes, stops the schedule and remembers the choice', d.on === false && d.optOut === true && d.sub === null && d.nextEve === null && d.nextRev === null, d);
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

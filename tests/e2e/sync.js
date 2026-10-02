// Two devices, one account: nothing either device does may be lost, online or offline.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../public'), S = process.env.S;
const results = []; const ok = (n, c, i) => results.push({ n, pass: !!c, i: c ? undefined : i });
const server = new Map(); let ver = 0; const vers = new Map(); const subs = new Map(); // path -> Set(page)
const cp = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
async function push(path) {
  for (const p of subs.get(path) || []) { try { await p.evaluate(([pa, d]) => window.__snap && window.__snap(pa, d), [path, server.get(path) ?? null]); } catch (e) {} }
}
function handler(page) {
  return async (src, m) => {
    if (m.op === 'get') return { data: cp(server.get(m.path)) ?? null, v: vers.get(m.path) || 0 };
    if (m.op === 'sub') { if (!subs.has(m.path)) subs.set(m.path, new Set()); subs.get(m.path).add(page); return {}; }
    if (m.op === 'set') { const cur = server.get(m.path); server.set(m.path, m.merge ? Object.assign(cp(cur) || {}, m.data) : m.data); vers.set(m.path, ++ver); setTimeout(() => push(m.path), 5); return {}; }
    if (m.op === 'del') { server.delete(m.path); vers.set(m.path, ++ver); setTimeout(() => push(m.path), 5); return {}; }
    if (m.op === 'list') return { rows: [...server.entries()].filter(([k]) => k.startsWith(m.prefix)).map(([path, data]) => ({ path, data: cp(data) })) };
    if (m.op === 'tx') {
      for (const [p, v] of Object.entries(m.reads)) if ((vers.get(p) || 0) !== v) return { ok: false };
      for (const w of m.writes) { server.set(w.path, w.data); vers.set(w.path, ++ver); setTimeout(() => push(w.path), 5); }
      return { ok: true };
    }
  };
}
async function device(b, name) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort()); await ctx.route('http://compass.test/**', async route => { const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type;
    if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb2.js')); type = 'text/javascript'; } else if (p === '/firebase-config.js') { body = 'window.COMPASS_FIREBASE_CONFIG={apiKey:"t",authDomain:"x",projectId:"x",appId:"x"}'; type = 'text/javascript'; } else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
    route.fulfill({ status: 200, body, contentType: type }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(name + ': ' + e.message));
  await ctx.exposeBinding('__srv', (src, m) => handler(p)(src, m));
  const dev = { ctx, p, errs, name };
  dev.tap = async s => { const l = dev.p.locator(s).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.tap({ timeout: 8000 }); await dev.p.waitForTimeout(200); };
  return dev;
}
const settle = ms => new Promise(r => setTimeout(r, ms));
const wk = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return 'users/u1/docs/w-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const tk = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const A = await device(b, 'A'), B = await device(b, 'B');
  // A sets up; B signs in to the same account
  await A.p.goto('http://compass.test/'); await A.p.waitForTimeout(500); await A.tap('.lhero [data-act=signin]'); await A.p.waitForTimeout(600);
  await A.tap('[data-act=obNext]'); for (const v of ['rel', 'body', 'mind']) await A.tap(`[data-act=obValue][data-v=${v}]`); await A.tap('[data-act=obCore][data-v=body]');
  while (await A.p.locator('[data-act=obNext]').count()) await A.tap('[data-act=obNext]');
  await settle(1500);
  ok('A finished setup and saved it', server.get('users/u1/docs/profile') && server.get('users/u1/docs/profile').onboarded);
  await B.p.goto('http://compass.test/'); await B.p.waitForTimeout(500); await B.tap('.lhero [data-act=signin]'); await B.p.waitForTimeout(1500);
  ok('B sees the same setup', await B.p.locator('.dayrow').count() > 0 && await B.p.locator('[data-act=obNext]').count() === 0);
  const daily = await A.p.locator('.dayrow[data-act=anchor]').evaluateAll(es => es.map(e => e.dataset.k));
  const [X, Y] = daily; // two daily floors
  const ticked = id => { const w = server.get(wk()); return !!(w && w.days && w.days[tk()] && w.days[tk()].a && w.days[tk()].a[id]); };
  const shows = async (dev, id) => dev.p.evaluate(id => { const e = document.querySelector(`.dayrow[data-k="${id}"]`); return e ? e.getAttribute('aria-pressed') === 'true' : !!document.querySelector('.donehead'); }, id);

  /* 1. both online, ticking different things within the same second */
  await Promise.all([A.tap(`.dayrow[data-k="${X}"]`), B.tap(`.dayrow[data-k="${Y}"]`)]);
  await settle(4000);
  ok('online, same moment: both ticks reach the server', ticked(X) && ticked(Y), server.get(wk()) && server.get(wk()).days);
  await A.p.waitForTimeout(500);
  const aDone = await A.p.evaluate(() => document.querySelectorAll('.donehead').length && document.querySelector('.donehead').innerText);
  const bDone = await B.p.evaluate(() => document.querySelectorAll('.donehead').length && document.querySelector('.donehead').innerText);
  const bLocal = await B.p.evaluate(k => localStorage.getItem('compass:u1:' + k.split('/').pop()), wk());
  ok('…and both devices show 2 done', /2 done/.test(aDone || '') && /2 done/.test(bDone || ''), { aDone, bDone, bLocal });

  /* 2. A offline unticks X and logs a workout; B online logs a workout and writes a journal line */
  await A.ctx.setOffline(true); await A.p.waitForTimeout(200);
  await A.tap('[data-act=doneFold]'); await A.tap(`.donelist .dayrow[data-k="${X}"]`);
  await A.tap('[data-act=inc][data-k=gym]');
  await A.p.fill('#j-win', 'Offline win from A'); await A.p.waitForTimeout(900);
  await B.tap('[data-act=inc][data-k=gym]');
  await B.p.fill('#j-spark', 'Lesson from B');
  await settle(2500);
  ok('while A is offline, B\'s changes are on the server', (server.get(wk()).c || {}).gym === 1, server.get(wk()).c);
  await A.ctx.setOffline(false); await settle(6000);
  let w = server.get(wk()), day = (w.days || {})[tk()] || {};
  ok('after A reconnects: A\'s untick survived', !ticked(X), day.a);
  ok('…B\'s tick of the other floor survived', ticked(Y), day.a);
  ok('…both workouts counted (1 + 1 = 2)', (w.c || {}).gym === 2, w.c);
  ok('…A\'s journal line and B\'s journal line both kept', /Offline win from A/.test(JSON.stringify(day.j || {})) && /Lesson from B/.test(JSON.stringify(day.j || {})), day.j);
  await A.p.evaluate(() => document.activeElement && document.activeElement.blur()); await B.p.evaluate(() => document.activeElement && document.activeElement.blur());
  await settle(1500);
  const aG = await A.p.locator('[data-act=inc][data-k=gym] .n').innerText(), bG = await B.p.locator('[data-act=inc][data-k=gym] .n').innerText();
  ok('…both screens agree: Workout 2/…', /^2\//.test(aG) && /^2\//.test(bG), { aG, bG });

  /* 3. profile: A offline adds a component; B online renames another */
  await A.ctx.setOffline(true);
  await A.tap('[data-act=tab][data-t=compass]'); await A.p.screenshot({ path: S + '/sync-a-compass.png' }); await A.tap('[data-act=cSec][data-k=values]');
  await A.tap('[data-act=addComp][data-value=body]'); await A.tap('[data-act=customComp]'); await A.p.fill('#c-name', 'Offline stretch'); await A.tap('[data-act=saveComp]'); await A.p.waitForTimeout(900);
  await B.tap('[data-act=tab][data-t=compass]'); await B.tap('[data-act=cSec][data-k=values]');
  await B.tap('[data-act=editComp]:has-text("Workout")'); await B.p.fill('#c-name', 'Gym session'); await B.tap('[data-act=saveComp]');
  await settle(2500);
  await A.ctx.setOffline(false); await settle(6000);
  const comps = (server.get('users/u1/docs/profile').components || []).map(c => c.name);
  ok('profile: A\'s new component and B\'s rename both kept', comps.includes('Offline stretch') && comps.includes('Gym session') && !comps.includes('Workout'), comps);

  /* 4. A closes the app while offline with unsaved changes, reopens later online */
  await A.tap('[data-act=tab][data-t=today]');
  await A.ctx.setOffline(true);
  await A.tap(`.dayrow[data-k="${X}"]`); await A.p.waitForTimeout(900);
  await B.tap('[data-act=tab][data-t=today]'); await B.p.fill('#j-win', 'B rewrote win while A was away'); await B.p.evaluate(() => document.activeElement.blur()); await settle(2000);
  await A.p.close(); A.p = await A.ctx.newPage(); A.p.on('pageerror', e => A.errs.push('A: ' + e.message));
  await A.ctx.setOffline(false);
  await A.p.goto('http://compass.test/'); await settle(6000);
  ok('tick made offline survives closing the app', ticked(X), ((server.get(wk()).days || {})[tk()] || {}).a);
  ok('…without undoing B\'s later edit', /B rewrote win/.test(JSON.stringify(((server.get(wk()).days || {})[tk()] || {}).j)), ((server.get(wk()).days || {})[tk()] || {}).j);

  /* 5. B deletes a component online while A is offline; A comes back without resurrecting it */
  await A.ctx.setOffline(true);
  await B.tap('[data-act=tab][data-t=compass]'); if (!(await B.p.locator('[data-act=editComp]').count())) await B.tap('[data-act=cSec][data-k=values]');
  await B.tap('[data-act=editComp]:has-text("Offline stretch")'); await B.tap('[data-act=delComp]'); await B.tap('[data-act=delCompYes]'); await settle(2500);
  await A.tap(`.dayrow[data-k="${Y}"]`).catch(() => {}); await A.p.waitForTimeout(600);
  await A.ctx.setOffline(false); await settle(6000);
  const names5 = (server.get('users/u1/docs/profile').components || []).map(c => c.name);
  ok('a component deleted on B stays deleted after A reconnects', !names5.includes('Offline stretch') && names5.includes('Gym session'), names5);
  /* 6. many quick taps on one device: none lost */
  await A.p.reload(); await settle(2500);
  await A.tap('[data-act=tab][data-t=today]');
  for (let i = 0; i < 5; i++) { await A.p.locator('[data-act=inc][data-k=gym]').first().tap(); await A.p.waitForTimeout(60); }
  await settle(4000);
  ok('five quick taps → five more workouts on the server', (server.get(wk()).c || {}).gym === 7, server.get(wk()).c);
  /* 7. sync indicator tells the truth while offline */
  await B.ctx.setOffline(true); await B.tap('[data-act=tab][data-t=today]'); await B.tap('[data-act=inc][data-k=gym]'); await B.p.waitForTimeout(900);
  const syncTxt = await B.p.locator('#sync').innerText();
  ok('offline: header says saved on this device', /Offline · saved on this device/.test(syncTxt), syncTxt);
  await B.ctx.setOffline(false); await settle(5000);
  ok('…and it syncs once back (8 workouts)', (server.get(wk()).c || {}).gym === 8, server.get(wk()).c);
  ok('…header back to synced', /Synced/.test(await B.p.locator('#sync').innerText()));
  /* 8. a save whose answer is lost (server took it, phone heard an error) is not counted twice */
  await A.p.reload(); await B.p.reload(); await settle(3000);
  let g0 = (server.get(wk()).c || {}).gym;
  await A.p.evaluate(() => { window.__failAfterCommit = 1; });
  await A.tap('[data-act=inc][data-k=gym]'); await settle(9000);
  ok('lost reply to a save: still +1, not +2', (server.get(wk()).c || {}).gym === g0 + 1, { before: g0, after: (server.get(wk()).c || {}).gym });
  /* 9. B saves twice while A's save is in flight: everything adds up exactly */
  g0 = (server.get(wk()).c || {}).gym;
  await A.p.evaluate(() => { window.__txDelay = 1500; });
  await A.ctx.setOffline(true); await A.tap('[data-act=inc][data-k=gym]'); await A.p.waitForTimeout(700);
  await A.ctx.setOffline(false); await A.p.waitForTimeout(300);
  await B.tap('[data-act=inc][data-k=gym]'); await B.p.waitForTimeout(300); await B.tap('[data-act=inc][data-k=gym]');
  await settle(9000); await A.p.evaluate(() => { window.__txDelay = 0; }); await settle(3000);
  ok('snapshot arriving mid-save: 1 (A) + 2 (B) = +3 exactly', (server.get(wk()).c || {}).gym === g0 + 3, { before: g0, after: (server.get(wk()).c || {}).gym });
  const shownA = await A.p.locator('[data-act=inc][data-k=gym] .n').innerText(), shownB = await B.p.locator('[data-act=inc][data-k=gym] .n').innerText();
  ok('…and both screens show the same count', shownA === shownB && shownA.startsWith(String(g0 + 3) + '/'), { shownA, shownB });
  /* 10. an old copy of a past week on a device that upgraded doesn't overwrite newer work */
  const past = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7); return 'w-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
  server.set('users/u1/docs/' + past, { kind: 'week', start: past.slice(2), days: {}, c: { gym: 3 }, r: { fun: 'Newer review from the phone' } }); vers.set('users/u1/docs/' + past, ++ver);
  await A.p.evaluate(p => { localStorage.setItem('compass:u1:' + p, JSON.stringify({ kind: 'week', start: p.slice(2), days: {}, c: { gym: 1 }, r: {} })); localStorage.removeItem('compass:u1:base:' + p); }, past);
  await A.p.reload(); await settle(3000);
  await A.tap('[data-act=prevWk]'); await settle(1500);
  await A.tap('[data-act=tab][data-t=today]'); await A.tap('[data-act=inc][data-k=gym]').catch(() => {}); await settle(4000);
  const pw = server.get('users/u1/docs/' + past);
  ok('stale past week: newer review kept and the tap adds to the newer count', pw.r.fun === 'Newer review from the phone' && pw.c.gym === 4, pw);
  await A.tap('[data-act=nextWk]');
  const v0 = ver; await settle(4000);
  ok('when idle, nothing keeps writing (no save loop)', ver === v0, { v0, ver });
  ok('no page errors', A.errs.length + B.errs.length === 0, A.errs.concat(B.errs));
  const f = results.filter(r => !r.pass); console.log(`sync: ${results.length - f.length}/${results.length} passed`); f.forEach(x => console.log('  FAIL', x.n, JSON.stringify(x.i || '').slice(0, 400)));
  await b.close(); process.exit(0);
})().catch(e => { console.log('CRASH', e.message.split('\n').slice(0, 3).join(' | ')); results.filter(r => !r.pass).forEach(x => console.log('  FAIL', x.n, JSON.stringify(x.i || '').slice(0, 300))); console.log('passed so far', results.filter(r => r.pass).length); process.exit(1); });

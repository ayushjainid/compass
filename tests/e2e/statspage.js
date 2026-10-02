// Owner dashboard (stats.html) against the mock SDK
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../public'), S = process.env.S;
const W = +(process.env.W || 390), H = +(process.env.H || 844), touch = process.env.T !== '0', dark = process.env.D === '1';
const results = []; const ok = (n, c, i) => results.push({ n, pass: !!c, i: c ? undefined : i });
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, channel: process.env.CHROMIUM ? undefined : 'chromium' });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, colorScheme: dark ? 'dark' : 'light', deviceScaleFactor: 2 });
  await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort()); await ctx.route('http://compass.test/**', async route => { const u = new URL(route.request().url()); let p = u.pathname, body, type;
    if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; } else if (p === '/firebase-config.js') { body = 'window.COMPASS_FIREBASE_CONFIG={apiKey:"t",authDomain:"x",projectId:"x",appId:"x"}'; type = 'text/javascript'; } else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
    route.fulfill({ status: 200, body, contentType: type }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const tap = async s => { const l = p.locator(s).first(); await l.scrollIntoViewIfNeeded().catch(()=>{}); touch ? await l.tap() : await l.click(); await p.waitForTimeout(250); };
  await p.goto('http://compass.test/stats.html'); await p.waitForTimeout(600);
  ok('signed out: asks to sign in', await p.locator('#signin').count() === 1);
  await tap('#signin'); await p.waitForTimeout(600);
  ok('not an admin: shows setup steps with the user id', /admins/.test(await p.locator('main').innerText()) && /u1/.test(await p.locator('main').innerText()));
  ok('not an admin: no numbers leak', await p.locator('.tile').count() === 0);
  // seed: admin + 90 days of tallies + worker status + feedback + errors
  await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('__mockstore') || '{}'); st['admins/u1'] = { at: 1 };
    const pad = n => String(n).padStart(2, '0'), dk = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const now = new Date();
    for (let i = 0; i < 95; i++) { const d = new Date(now); d.setDate(d.getDate() - i); st['stats/d-' + dk(d)] = { active: 20 + (i % 7) * 3 + Math.round(40 - i / 3), obStart: 3, obDone: 2, logged: 15 }; }
    const m = new Date(now); m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
    for (let i = 0; i < 14; i++) { const d = new Date(m); d.setDate(d.getDate() - 7 * i); st['stats/w-' + dk(d)] = { active: 120 - i * 4, obDone: 14, logged: 90, planned: 40, reviewed: 30, tasks: 25, remindersOn: 10, paused: 3, exported: 6, feedback: 1, a0: 14, a1: 12, a2: 11, a3: 10, a4: 9, a5: 9, a6: 8, a7: 8, a8: 7, a9: 7, a10: 6, a11: 6, a12: 13 }; }
    const k = 'd' + new Date().toISOString().slice(0, 10).replace(/-/g, '');
    st['status/reminders'] = { at: new Date(Date.now() - 4 * 60000).toISOString(), ok: true, lastSendAt: new Date(Date.now() - 3600e3).toISOString(), sent: { [k]: 41 }, failed: { [k]: 2 }, errors: {} };
    st['feedback/u9-1'] = { uid: 'u9', text: 'Love the Sunday review <b>bold</b>', at: new Date(Date.now() - 2 * 3600e3).toISOString(), screen: 'review' };
    st['feedback/u8-2'] = { uid: 'u8', text: 'Pause is great', at: new Date(Date.now() - 600e3).toISOString(), screen: 'compass' };
    st['errors/u9'] = { items: [{ at: new Date().toISOString(), msg: 'TypeError: x is undefined', where: 'render' }, { at: new Date().toISOString(), msg: 'TypeError: x is undefined', where: 'render' }] };
    st['errors/u7'] = { items: [null, 5, { at: 'nonsense', msg: 'bad date' }, { at: new Date().toISOString(), msg: 'TypeError: x is undefined', where: 42 }] }; st['errors/u8'] = { items: [{ at: new Date().toISOString(), msg: 'TypeError: x is undefined', where: 'render' }, { at: new Date(Date.now() - 30 * 864e5).toISOString(), msg: 'old one', where: 'x' }] };
    localStorage.setItem('__mockstore', JSON.stringify(st));
  });
  await p.reload(); await p.waitForTimeout(900);
  const main = await p.locator('main').innerText();
  ok('admin: four tiles', await p.locator('.tile').count() === 4);
  ok('admin: active this week shows 120, last week 116', /Active this week\s*120\s*Last week 116/.test(main), main.slice(0, 400));
  ok('admin: daily chart has 30 bars', await p.locator('#c-daily g.m').count() === 30);
  ok('admin: weekly chart 8 weeks', await p.locator('#c-weekly g.m').count() === 8);
  ok('admin: age chart 13 groups', await p.locator('#c-age g.m').count() === 13);
  ok('admin: feature table share', /Logged a floor\s*90\s*90\s*75%/.test(main), main.match(/Logged a floor[^\n]*/));
  ok('admin: reminders healthy', await p.locator('.status.ok').count() === 1 && /Sent, last 7 days\s*41/.test(main));
  ok('admin: errors grouped by accounts, old ones dropped', /\b3\b\s*TypeError: x is undefined/.test(main) && !/old one|bad date/.test(main), main.match(/Errors, last 7 days[\s\S]{0,200}/));
  ok('admin: feedback escaped, newest first, no uid', /Pause is great[\s\S]*Love the Sunday/.test(main) && /<b>bold<\/b>/.test(main) && !/u9|u8/.test(main));
  await tap('[data-range="90"]');
  ok('range 90: 90 daily bars, 13 weeks', await p.locator('#c-daily g.m').count() === 90 && await p.locator('#c-weekly g.m').count() === 13);
  // hover / focus tooltip
  if (touch) await p.locator('#c-weekly g.m').last().focus(); else await p.locator('#c-weekly g.m').last().hover();
  await p.waitForTimeout(200);
  ok('tooltip shows week and value', /Week of .* · 120/.test(await p.locator('#c-weekly .tip').innerText()) && await p.locator('#c-weekly .tip.on').count() === 1);
  ok('table fallback exists', await p.locator('#c-daily ~ details.tbl, details.tbl').count() >= 3);
  const ov = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  ok('no sideways scroll', !ov);
  await p.screenshot({ path: `${S}/stats-${W}${dark ? 'd' : ''}.png`, fullPage: true });
  // stale worker
  await p.evaluate(() => { const st = JSON.parse(localStorage.getItem('__mockstore')); st['status/reminders'].at = new Date(Date.now() - 2 * 3600e3).toISOString(); localStorage.setItem('__mockstore', JSON.stringify(st)); });
  await p.reload(); await p.waitForTimeout(900);
  ok('worker silent 2h: warning', await p.locator('.status.warn').count() === 1);
  await p.evaluate(() => { const st = JSON.parse(localStorage.getItem('__mockstore')); Object.assign(st['status/reminders'], { at: new Date().toISOString(), ok: false, lastError: 'VAPID keys are not set', lastErrorAt: new Date().toISOString() }); localStorage.setItem('__mockstore', JSON.stringify(st)); });
  await p.reload(); await p.waitForTimeout(900);
  ok('worker erroring: red with message', await p.locator('.status.bad').count() === 1 && /VAPID/.test(await p.locator('.status.bad').innerText()));
  await p.evaluate(() => { const st = JSON.parse(localStorage.getItem('__mockstore')); delete st['status/reminders']; localStorage.setItem('__mockstore', JSON.stringify(st)); });
  await p.reload(); await p.waitForTimeout(900);
  ok('worker never deployed: neutral note', await p.locator('.status.off').count() === 1);
  ok('no page errors', !errs.length, errs);
  console.log(`statspage ${W}${dark ? 'd' : ''}: ${results.filter(x => x.pass).length}/${results.length} passed`); results.filter(x => !x.pass).forEach(x => console.log('  FAIL', x.n, JSON.stringify(x.i || '').slice(0, 400)));
  await b.close(); })();

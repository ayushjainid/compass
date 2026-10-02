// Today: one time-ordered list (daily + planned weekly/monthly), done items fold into a "done" strip
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../public'), S = process.env.S;
const W = +(process.env.W || 390), H = +(process.env.H || 844), touch = process.env.T !== '0', dark = process.env.D === '1';
const results = []; const ok = (n, c, i) => results.push({ n, pass: !!c, i: c ? undefined : i });
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, colorScheme: dark ? 'dark' : 'light', deviceScaleFactor: 2 });
  await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort()); await ctx.route('http://compass.test/**', async route => { const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type;
    if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; } else if (p === '/firebase-config.js') { body = 'window.COMPASS_FIREBASE_CONFIG={apiKey:"t",authDomain:"x",projectId:"x",appId:"x"}'; type = 'text/javascript'; } else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
    route.fulfill({ status: 200, body, contentType: type }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const tap = async s => { const l = typeof s === 'string' ? p.locator(s).first() : s; await l.scrollIntoViewIfNeeded().catch(()=>{}); touch ? await l.tap() : await l.click(); await p.waitForTimeout(200); };
  await p.goto('http://compass.test/'); await p.waitForTimeout(500); await tap('.lhero [data-act=signin]'); await p.waitForTimeout(600);
  await tap('[data-act=obNext]'); for (const v of ['rel', 'body', 'mind']) await tap(`[data-act=obValue][data-v=${v}]`); await tap('[data-act=obCore][data-v=body]');
  while (await p.locator('[data-act=obNext]').count()) await tap('[data-act=obNext]');
  await p.waitForTimeout(1000);
  // give things times: today's weekday index
  const di = await p.evaluate(() => (new Date().getDay() + 6) % 7);
  await p.evaluate(di => { const st = JSON.parse(localStorage.getItem('__mockstore')); const pr = st['users/u1/docs/profile'];
    const all = [0, 1, 2, 3, 4, 5, 6];
    pr.components.forEach(c => {
      if (c.id === 'reach') c.block = { days: all, time: '21:00', dur: 15 };
      if (c.id === 'sleep') c.block = { days: all, time: '07:00', dur: 15 };
      if (c.id === 'gym') c.block = { days: [di], time: '06:30', dur: 60 };
    });
    pr.components.push({ id: 'skin', value: 'body', name: 'Skincare', cadence: 'daily', target: 7, hours: 1/6, note: '10 mins' });
    localStorage.setItem('__mockstore', JSON.stringify(st)); }, di);
  await p.reload(); await p.waitForTimeout(1500);
  const rows = async () => p.locator('.daylist .dayrow').evaluateAll(es => es.map(e => ({ id: e.dataset.k, kind: [...e.classList].find(k => ['daily', 'weekly', 'monthly'].includes(k)), t: (e.querySelector('.dtime') || {}).textContent || '' })));
  let r = await rows();
  ok('one list mixes daily and planned weekly', r.some(x => x.kind === 'weekly') && r.some(x => x.kind === 'daily') && await p.locator('h3:has-text("Planned")').count() === 0, r);
  ok('timed first in time order: 6:30 workout, 7 am sleep … 9 pm reach', r[0].id === 'gym' && r[1].id === 'sleep' && r.findIndex(x => x.id === 'reach') === r.filter(x => x.t).length - 1, r);
  ok('untimed Skincare sits below the timed ones', r.findIndex(x => x.id === 'skin') > r.findIndex(x => x.id === 'reach'), r); ok('untimed after the timed ones', r.every((x, i) => !x.t || r.slice(0, i).every(y => y.t)), r);
  ok('weekly row is marked as weekly', /weekly/i.test(await p.locator('.dayrow.weekly .ktag').first().innerText()));
  await p.screenshot({ path: `${S}/daylist-0-${W}${dark ? 'd' : ''}.png` });
  const n0 = r.length;
  await tap('.daylist .dayrow[data-k=gym]'); await p.waitForTimeout(600);
  r = await rows();
  ok('ticked item leaves the pending list', !r.some(x => x.id === 'gym') && r.length === n0 - 1, r);
  ok('a done strip shows the count and names', /1 done/.test(await p.locator('.donehead').innerText()) && /Workout/.test(await p.locator('.donehead').innerText()));
  ok('done items stay collapsed', await p.locator('.donelist').count() === 0);
  await tap('.daylist .dayrow[data-k=sleep]'); await p.waitForTimeout(600);
  r = await rows();
  ok('pending ones close ranks in order', r[0].id !== 'sleep' && r.length === n0 - 2);
  ok('heading counts progress', /2 of \d+ done/.test(await p.locator('h3:has-text("Your day")').innerText()));
  const wk = await p.evaluate(() => JSON.parse(localStorage.getItem('__mockstore')));
  await tap('[data-act=doneFold]');
  ok('tap the strip to see done items, struck through', await p.locator('.donelist .dayrow.isdone').count() === 2);
  await p.screenshot({ path: `${S}/daylist-1-${W}${dark ? 'd' : ''}.png`, fullPage: true });
  await tap('.donelist .dayrow[data-k=gym]'); await p.waitForTimeout(400);
  r = await rows();
  ok('unticking puts it back in its time slot', r[0].id === 'gym' && await p.locator('.donelist .dayrow').count() === 1, r);
  // weekly progress counted once and reverted
  const cnt = await p.evaluate(() => { const st = JSON.parse(localStorage.getItem('__mockstore')); const k = Object.keys(st).find(k => /docs\/w-/.test(k)); return st[k] && st[k].c && st[k].c.gym; });
  ok('weekly count reverted after untick', !cnt, cnt);
  // tick everything
  for (let i = 0; i < 30 && await p.locator('.daylist .dayrow').count(); i++) { await tap('.daylist .dayrow'); await p.waitForTimeout(450); }
  await p.waitForTimeout(1500);
  const tx0 = await p.evaluate(() => window.__tx); await p.waitForTimeout(2500); const tx1 = await p.evaluate(() => window.__tx);
  const wkd = await p.evaluate(() => { const st = JSON.parse(localStorage.getItem('__mockstore')); const k = Object.keys(st).find(k => /docs\/w-/.test(k)); return st[k]; });
  ok('weekly count is exactly one after tick, untick, tick (no double counting)', (wkd.c || {}).gym === 1, wkd.c);
  ok('idle: no repeated saves', tx1 === tx0, { tx0, tx1 });
  ok('all done shows a calm message', await p.locator('.alldone').count() === 1);
  ok('no sideways scroll', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  ok('no page errors', errs.length === 0, errs);
  const f = results.filter(r => !r.pass); console.log(`daylist ${W}${dark ? 'd' : ''}: ${results.length - f.length}/${results.length} passed`); f.forEach(x => console.log('  FAIL', x.n, JSON.stringify(x.i || '').slice(0, 400)));
  await b.close(); })().catch(e => { console.log('CRASH', e.message.split('\n')[0]); results.filter(r => !r.pass).forEach(x => console.log('  FAIL', x.n, JSON.stringify(x.i || '').slice(0, 300))); process.exit(1); });

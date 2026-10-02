// Review: each floor's last 8 weeks
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
  const tap = async s => { const l = p.locator(s).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); touch ? await l.tap() : await l.click(); await p.waitForTimeout(250); };
  await p.goto('http://compass.test/'); await p.waitForTimeout(500); await tap('.lhero [data-act=signin]'); await p.waitForTimeout(600);
  await tap('[data-act=obNext]'); for (const v of ['rel', 'body']) await tap(`[data-act=obValue][data-v=${v}]`);
  while (await p.locator('[data-act=obNext]').count()) await tap('[data-act=obNext]');
  await p.waitForTimeout(1200);
  // 7 past weeks: workout 3,3,1,0,3,2,3 (target 3) → held 4 of 7; started 10 weeks ago
  await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('__mockstore')); const pad = n => String(n).padStart(2, '0'), k = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const mon = new Date(); mon.setHours(0, 0, 0, 0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
    const gym = [3, 3, 1, 0, 3, 2, 3];
    for (let i = 7; i >= 1; i--) { const m = new Date(mon); m.setDate(m.getDate() - 7 * i); const days = {};
      for (let d = 0; d < 5; d++) { const dd = new Date(m); dd.setDate(dd.getDate() + d); days[k(dd)] = { a: { reach: d < (i % 2 ? 5 : 2) }, j: {} }; }
      st['users/u1/docs/w-' + k(m)] = { kind: 'week', start: k(m), days, c: { gym: gym[7 - i] }, r: {} }; }
    const start = new Date(mon); start.setDate(start.getDate() - 70); st['users/u1/docs/profile'].onboardedAt = k(start);
    localStorage.setItem('__mockstore', JSON.stringify(st));
    Object.keys(localStorage).filter(x => x.startsWith('compass:u1:')).forEach(x => localStorage.removeItem(x));
  });
  await p.reload(); await p.waitForTimeout(1800);
  await tap('[data-act=tab][data-t=review]');
  const rows = await p.locator('.fhist .fh').evaluateAll(es => es.map(e => ({ nm: e.querySelector('.nm').textContent, sum: e.querySelector('.sum').textContent, n: e.querySelectorAll('.bars i').length, ok: e.querySelectorAll('.bars i.ok').length, part: e.querySelectorAll('.bars i.part').length, now: e.querySelectorAll('.bars i.now').length, aria: e.getAttribute('aria-label') })));
  const gym = rows.find(r => /Workout/.test(r.nm)), reach = rows.find(r => /Reach out/.test(r.nm));
  ok('Review shows a row per floor with 8 week bars', rows.length >= 2 && rows.every(r => r.n === 8 && r.now === 1), rows);
  ok('Workout: held 4 of the 7 finished weeks', gym && gym.sum === '4/7' && gym.ok >= 4 && gym.part >= 2, gym);
  ok('daily floor counts days per week too', reach && /\/7$/.test(reach.sum), reach);
  ok('screen readers get a sentence', gym && /held 4 of the last 7 weeks/.test(gym.aria), gym && gym.aria);
  await p.locator('.fhist').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${S}/fhist-${W}${dark ? 'd' : ''}.png` });
  ok('no sideways scroll', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  ok('no page errors', errs.length === 0, errs);
  const f = results.filter(r => !r.pass); console.log(`fhist ${W}${dark ? 'd' : ''}: ${results.length - f.length}/${results.length} passed`); f.forEach(x => console.log('  FAIL', x.n, JSON.stringify(x.i || '').slice(0, 500)));
  await b.close(); })().catch(e => { console.log('CRASH', e.message.split('\n')[0]); process.exit(1); });

// Monthly look-back: the review card early in the month, the page's numbers, words, navigation
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../public'), S = process.env.S;
const W = +(process.env.W || 390), H = +(process.env.H || 844), touch = process.env.T !== '0', dark = process.env.D === '1';
const results = []; const ok = (n, c, i) => results.push({ n, pass: !!c, i: c ? undefined : i });
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, channel: process.env.CHROMIUM ? undefined : 'chromium' });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, colorScheme: dark ? 'dark' : 'light', deviceScaleFactor: 2 });
  await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort());
  await ctx.route('http://compass.test/**', async route => { const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type;
    if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; } else if (p === '/firebase-config.js') { body = 'self.COMPASS_FIREBASE_CONFIG={apiKey:"t",authDomain:"x",projectId:"x",appId:"x"}'; type = 'text/javascript'; } else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
    route.fulfill({ status: 200, body, contentType: type }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const tap = async s => { const l = typeof s === 'string' ? p.locator(s).first() : s; await l.scrollIntoViewIfNeeded().catch(() => {}); touch ? await l.tap() : await l.click(); await p.waitForTimeout(250); };
  await p.goto('http://compass.test/'); await p.waitForTimeout(500); await tap('.lhero [data-act=signin]'); await p.waitForTimeout(600);
  await tap('[data-act=obNext]'); for (const v of ['rel', 'body']) await tap(`[data-act=obValue][data-v=${v}]`);
  while (await p.locator('[data-act=obNext]').count()) await tap('[data-act=obNext]');
  await p.waitForTimeout(900);
  // a month of history: the first full week every floor held (and felt 'Good'), the rest mostly missed
  const info = await p.evaluate(() => {
    const pad = n => String(n).padStart(2, '0'), dk = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const now = new Date(), lm = new Date(now.getFullYear(), now.getMonth() - 1, 1), ym = dk(lm).slice(0, 7);
    const mon = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
    const weeks = []; for (let m = mon(new Date(lm.getFullYear(), lm.getMonth(), lm.getDate() - 6)); ; m = new Date(m.getFullYear(), m.getMonth(), m.getDate() + 7)) { const th = new Date(m.getFullYear(), m.getMonth(), m.getDate() + 3); if (dk(th).slice(0, 7) > ym) break; if (dk(th).slice(0, 7) === ym) weeks.push(dk(m)); }
    const st = JSON.parse(localStorage.getItem('__mockstore')); const pr = st['users/u1/docs/profile'];
    pr.onboardedAt = dk(new Date(lm.getFullYear(), lm.getMonth() - 1, 1));
    const comps = pr.components.filter(c => !c.fun);
    weeks.forEach((w, i) => {
      const days = {}; const c = {};
      for (let k = 0; k < 7; k++) { const d = new Date(+w.slice(0, 4), +w.slice(5, 7) - 1, +w.slice(8) + k); const a = {}; if (i === 0) comps.filter(x => x.cadence === 'daily').forEach(x => a[x.id] = true); days[dk(d)] = { a, j: k === 2 ? { win: i === 0 ? 'Finished the <b>draft</b> & called Mum' : 'Small walk in the rain' } : {} }; }
      if (i === 0) comps.filter(x => x.cadence !== 'daily').forEach(x => c[x.id] = x.target);
      st['users/u1/docs/w-' + w] = { kind: 'week', start: w, days, c, r: i === 0 ? { felt: 4 } : {} };
    });
    st['users/u1/docs/settings'] = Object.assign(st['users/u1/docs/settings'] || {}, { months: { [dk(new Date(lm.getFullYear(), lm.getMonth() - 1, 1)).slice(0, 7)]: { adjust: 'Gym before work' } } });
    localStorage.setItem('__mockstore', JSON.stringify(st));
    Object.keys(localStorage).filter(k => /:(settings|profile)$|:w-/.test(k) && k !== '__mockstore').forEach(k => localStorage.removeItem(k));
    return { ym, weeks, monthName: lm.toLocaleString('en', { month: 'long' }), early: now.getDate() <= 10, daysInMonth: new Date(lm.getFullYear(), lm.getMonth() + 1, 0).getDate() };
  });
  await p.reload(); await p.waitForTimeout(1500);
  await tap('[data-act=tab][data-t=review]'); await p.waitForTimeout(800);
  if (info.early) ok('early in the month: the review opens with the look-back card', await p.locator('.lookcard').count() === 1 && new RegExp(`Your ${info.monthName}`, 'i').test(await p.locator('.lookcard').innerText()));
  ok('a "Look back by month" link is always there', await p.locator('.lklink').count() === 1);
  await p.screenshot({ path: `${S}/lookback-card-${W}${dark ? 'd' : ''}.png` });
  await tap(info.early ? '.lookcard' : '.lklink'); await p.waitForTimeout(500);
  const txt = await p.locator('#main').innerText();
  ok('page names the month', new RegExp(`Your ${info.monthName}`).test(txt), txt.slice(0, 200));
  ok('one value dot per week', await p.locator('.lkvals li').first().locator('.lkdots i').count() === info.weeks.length, info.weeks);
  ok('weeks with every value held: 1 of them', new RegExp(`1\\s*/${info.weeks.length}\\s*weeks every value held`).test(txt), txt.slice(0, 400));
  ok('days checked in counted against the month', new RegExp(`(\\d+)\\s*/${info.daysInMonth}\\s*days you checked in`).test(txt));
  ok('felt-sense from the one review', /Good\s*how the month felt/.test(txt));
  ok('best week shown with 100%', /Best week[\s\S]*100% of floors met/i.test(txt));
  ok('floors held every week vs needing a smaller floor', /Needs a smaller floor\?/i.test(txt));
  ok('their own words, escaped', /Finished the <b>draft<\/b> & called Mum/.test(txt) && await p.locator('.lkwords b').count() === 0);
  ok('tied values: no false "strongest"', /Your values moved together this month/.test(txt) && !/Strongest/.test(txt));
  ok('dots sit on the same line as the value name', await p.evaluate(() => { const li = document.querySelector('.lkvals li'); const a = li.querySelector('.nm').getBoundingClientRect(), d = li.querySelector('.lkdots').getBoundingClientRect(); return Math.abs((a.top + a.bottom) / 2 - (d.top + d.bottom) / 2) < 14; }));
  ok("last month's chosen adjustment shown", /Gym before work/.test(txt));
  await p.screenshot({ path: `${S}/lookback-${W}${dark ? 'd' : ''}.png`, fullPage: true });
  const st = await p.evaluate(() => new Promise(r => setTimeout(() => r(JSON.parse(localStorage.getItem('__mockstore'))), 900)));
  ok('opening it is counted (anonymously) and remembered as seen', Object.keys(st).some(k => /^stats\/d-/.test(k) && st[k].lookback === 1) && (st['users/u1/docs/settings'].lookSeen || {})[info.ym] === 1, st['users/u1/docs/settings'].lookSeen);
  // navigation: next month (current, "so far") and back
  const nextBtn = p.locator('.lknav button').last();
  ok('can step to this month so far', /so far/.test(await nextBtn.innerText()));
  await tap(nextBtn);
  ok('this month so far', /so far/.test(await p.locator('.lkhead h2').innerText()));
  await tap('.lkhead [data-act=lookClose]');
  ok('back to the review', /Sunday review/.test(await p.locator('#main').innerText()) && await p.locator('.lkhead').count() === 0);
  ok('card gone once seen', await p.locator('.lookcard').count() === 0);
  await tap('[data-act=tab][data-t=today]'); await tap('[data-act=tab][data-t=review]');
  ok('switching tabs leaves the look-back', await p.locator('.lkhead').count() === 0);
  const ov = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  ok('no sideways scroll', !ov);
  ok('no page errors', !errs.length, errs);
  console.log(`lookback ${W}${dark ? 'd' : ''}: ${results.filter(x => x.pass).length}/${results.length} passed`); results.filter(x => !x.pass).forEach(x => console.log('  FAIL', x.n, JSON.stringify(x.i || '').slice(0, 300)));
  await b.close(); })();

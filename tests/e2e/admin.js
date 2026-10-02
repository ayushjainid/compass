// Owner-only "Usage dashboard" link in the account sheet; opens /stats and comes back
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../public'), S = process.env.S;
const W = +(process.env.W || 390), H = +(process.env.H || 844), touch = process.env.T !== '0';
const results = []; const ok = (n, c, i) => results.push({ n, pass: !!c, i: c ? undefined : i });
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, channel: process.env.CHROMIUM ? undefined : 'chromium' });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 2 });
  await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort());
  await ctx.route('http://compass.test/**', async route => { const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname === '/stats' ? '/stats.html' : u.pathname, body, type;
    if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; } else if (p === '/firebase-config.js') { body = 'window.COMPASS_FIREBASE_CONFIG={apiKey:"t",authDomain:"x",projectId:"x",appId:"x"}'; type = 'text/javascript'; } else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
    route.fulfill({ status: 200, body, contentType: type }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const tap = async s => { const l = p.locator(s).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); touch ? await l.tap() : await l.click(); await p.waitForTimeout(250); };
  await p.goto('http://compass.test/'); await p.waitForTimeout(500); await tap('.lhero [data-act=signin]'); await p.waitForTimeout(600);
  await tap('[data-act=obNext]'); for (const v of ['rel', 'body']) await tap(`[data-act=obValue][data-v=${v}]`);
  while (await p.locator('[data-act=obNext]').count()) await tap('[data-act=obNext]');
  await p.waitForTimeout(900);
  await tap('#acctBtn');
  ok('not an owner: no dashboard link', await p.locator('.sheet .admlink').count() === 0 && await p.locator('.sheet [data-act=signout]').count() === 1);
  await p.keyboard.press('Escape');
  await p.evaluate(() => { const st = JSON.parse(localStorage.getItem('__mockstore')); st['admins/u1'] = { at: 1 }; localStorage.setItem('__mockstore', JSON.stringify(st)); });
  await p.reload(); await p.waitForTimeout(1500);
  await tap('#acctBtn');
  ok('owner: dashboard link in the account sheet', await p.locator('.sheet .admlink[href="/stats"]').count() === 1 && /Only you see this/.test(await p.locator('.sheet .admlink').innerText()));
  await p.screenshot({ path: `${S}/admin-sheet-${W}.png` });
  await tap('.sheet .admlink'); await p.waitForTimeout(1200);
  ok('opens the dashboard, already signed in', /\/stats$/.test(p.url()) && await p.locator('.tile').count() === 4, p.url());
  await p.screenshot({ path: `${S}/admin-stats-${W}.png` });
  await tap('a.brand'); await p.waitForTimeout(1500);
  ok('back link returns to the app', /compass\.test\/$/.test(p.url()) && await p.locator('#acctBtn').count() === 1, p.url());
  // signing out and in as someone else clears the owner link
  await p.evaluate(() => { const st = JSON.parse(localStorage.getItem('__mockstore')); delete st['admins/u1']; localStorage.setItem('__mockstore', JSON.stringify(st)); });
  await p.reload(); await p.waitForTimeout(1500); await tap('#acctBtn');
  ok('no longer an owner: link gone', await p.locator('.sheet .admlink').count() === 0);
  ok('no page errors', !errs.length, errs);
  console.log(`admin ${W}: ${results.filter(x => x.pass).length}/${results.length} passed`); results.filter(x => !x.pass).forEach(x => console.log('  FAIL', x.n, JSON.stringify(x.i || '').slice(0, 300)));
  await b.close(); })();

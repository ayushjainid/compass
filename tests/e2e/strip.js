const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../public'), S = process.env.S;
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'dark', deviceScaleFactor: 2 });
  await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort()); await ctx.route('http://compass.test/**', async route => { const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type;
    if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; } else if (p === '/firebase-config.js') { body = 'window.COMPASS_FIREBASE_CONFIG={apiKey:"t",authDomain:"x",projectId:"x",appId:"x"}'; type = 'text/javascript'; } else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
    route.fulfill({ status: 200, body, contentType: type }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const tap = async s => { const l = p.locator(s).first(); await l.scrollIntoViewIfNeeded().catch(()=>{}); await l.tap(); await p.waitForTimeout(200); };
  await p.goto('http://compass.test/'); await p.waitForTimeout(500); await tap('.lhero [data-act=signin]'); await p.waitForTimeout(600);
  await tap('[data-act=obNext]'); for (const v of ['rel', 'body']) await tap(`[data-act=obValue][data-v=${v}]`);
  while (await p.locator('[data-act=obNext]').count()) await tap('[data-act=obNext]');
  await p.waitForTimeout(500);
  const y = () => p.evaluate(() => Math.round(document.querySelector('.strip').getBoundingClientRect().top + scrollY));
  const ys = [await y()]; const greetToday = /Good (morning|afternoon|evening|night)/.test(await p.locator('.lede').first().innerText());
  await p.screenshot({ path: S + '/strip-today.png' });
  const days = await p.locator('.strip button').count();
  for (let i = 0; i < days; i++) { await tap(`.strip button >> nth=${i}`); ys.push(await y()); }
  await tap('.strip button[aria-pressed=false]');
  const greetOther = /Good (morning|afternoon|evening|night)/.test(await p.locator('#main').innerText());
  console.log(JSON.stringify({ steady: new Set(ys).size === 1, ys, greetToday, greetOther, errs }));
  await b.close(); })();

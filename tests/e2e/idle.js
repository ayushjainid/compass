// No save loops: sit idle on each setup step and on every tab, count saves
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../public'), S = process.env.S;
const results = []; const ok = (n, c, i) => results.push({ n, pass: !!c, i: c ? undefined : i });
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, channel: process.env.CHROMIUM ? undefined : 'chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort()); await ctx.route('http://compass.test/**', async route => { const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type;
    if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; } else if (p === '/firebase-config.js') { body = 'window.COMPASS_FIREBASE_CONFIG={apiKey:"t",authDomain:"x",projectId:"x",appId:"x"}'; type = 'text/javascript'; } else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
    route.fulfill({ status: 200, body, contentType: type }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const tap = async s => { const l = p.locator(s).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.tap(); await p.waitForTimeout(250); };
  const idle = async name => { await p.waitForTimeout(1500); const a = await p.evaluate(() => window.__tx || 0); await p.waitForTimeout(3000); const z = await p.evaluate(() => window.__tx || 0); ok(`idle on ${name}: no repeated saves`, z === a, { a, z }); };
  await p.goto('http://compass.test/'); await p.waitForTimeout(500); await tap('.lhero [data-act=signin]'); await p.waitForTimeout(600);
  await tap('[data-act=obNext]'); for (const v of ['rel', 'body']) await tap(`[data-act=obValue][data-v=${v}]`); await idle('setup: values');
  await tap('[data-act=obNext]'); await idle('setup: week');
  await tap('[data-act=obNext]'); await idle('setup: floors');
  await tap('[data-act=obNext]'); await idle('today');
  for (const t of ['week', 'tasks', 'review', 'compass']) { await tap(`[data-act=tab][data-t=${t}]`); await idle(t); }
  await tap('[data-act=tab][data-t=today]'); await tap('.dayrow'); await idle('today after a tick');
  await p.reload(); await idle('after reload');
  ok('no page errors', errs.length === 0, errs);
  const f = results.filter(r => !r.pass); console.log(`idle: ${results.length - f.length}/${results.length} passed`); f.forEach(x => console.log('  FAIL', x.n, JSON.stringify(x.i || '')));
  await b.close(); })().catch(e => { console.log('CRASH', e.message.split('\n')[0]); process.exit(1); });

const { chromium } = require('./engine'); const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../public'), S = process.env.S;
const W = +(process.env.W || 390), H = +(process.env.H || 844), touch = process.env.T !== '0';
const results = []; const ok = (n, c, i) => results.push({ n, pass: !!c, i: c ? undefined : i });
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, channel: process.env.CHROMIUM ? undefined : 'chromium' });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, colorScheme: 'dark', deviceScaleFactor: 2 });
  await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort()); await ctx.route('http://compass.test/**', async route => { const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type;
    if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; } else if (p === '/firebase-config.js') { body = 'window.COMPASS_FIREBASE_CONFIG={apiKey:"t",authDomain:"x",projectId:"x",appId:"x"}'; type = 'text/javascript'; } else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
    route.fulfill({ status: 200, body, contentType: type }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const tap = async (s, o = {}) => { const l = p.locator(s).first(); await l.evaluate(e => e.scrollIntoView({ block: 'center', behavior: 'instant' })).catch(() => {});   // centred: right under the pinned tray, Safari's engine can't settle on a spot to tap
  try { touch ? await l.tap(Object.assign({ timeout: 10000 }, o)) : await l.click(Object.assign({ timeout: 10000 }, o)); } catch (e) { const hit = await l.evaluate(el => { const r = el.getBoundingClientRect(), h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { r: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], ih: innerHeight, sy: scrollY, hit: h && (h.tagName + '.' + [...h.classList].join('.') + (h.id ? '#' + h.id : '')), sheet: ((document.querySelector('.sheet') || {}).innerText || '').slice(0, 160) }; }).catch(() => null); throw new Error('tap ' + s + ' ' + JSON.stringify(hit) + ': ' + e.message.split('\n').slice(0, 12).join(' | ')); } await p.waitForTimeout(250); };
  await p.goto('http://compass.test/'); await p.waitForTimeout(500); await tap('.lhero [data-act=signin]'); await p.waitForTimeout(600);
  await tap('[data-act=obNext]'); for (const v of ['rel', 'body', 'solve']) await tap(`[data-act=obValue][data-v=${v}]`);
  while (await p.locator('[data-act=obNext]').count()) await tap('[data-act=obNext]');
  await p.waitForTimeout(500);
  await tap('[data-act=tab][data-t=week]'); await tap('[data-act=weekView][data-v=plan]');
  await tap('[data-act=autoPlan]').catch(() => {}); await p.waitForTimeout(500);
  const placed = () => p.locator('.pblk[data-act=blkEdit]').count();
  const n0 = await placed();
  ok('something is planned to start with', n0 > 0, n0);
  await tap('[data-act=clearPlan]');
  ok('Start over asks first', await p.locator('.sheet[role=alertdialog]').count() === 1 && /Start your week plan over\?/.test(await p.locator('.sheet').innerText()) && await placed() === n0);
  ok('says what will be cleared and what stays', /session/.test(await p.locator('.sheet').innerText()) && /ticks, history and monthly one-offs stay/.test(await p.locator('.sheet').innerText()));
  await p.screenshot({ path: `${S}/clearplan-${W}.png` });
  await tap('[data-act=clearPlanNo]');
  ok('Keep my plan closes and changes nothing', await p.locator('.sheet').count() === 0 && await placed() === n0);
  await tap('[data-act=clearPlan]'); await tap('.scrim', { position: { x: 20, y: 20 } });  // the top of the dimmed page, clear of the sheet whatever its height
  ok('tapping outside also keeps it', await p.locator('.sheet').count() === 0 && await placed() === n0);
  await tap('[data-act=clearPlan]'); await tap('[data-act=clearPlanYes]'); await p.waitForTimeout(300);
  ok('confirming clears every day', await placed() === 0 && await p.locator('.sheet').count() === 0);
  ok('no page errors', errs.length === 0, errs);
  const f = results.filter(r => !r.pass); console.log(`clearplan ${W}: ${results.length - f.length}/${results.length} passed`); f.forEach(x => console.log('  FAIL', x.n, JSON.stringify(x.i || '').slice(0, 300)));
  await b.close(); })().catch(e => { console.log('CRASH', e.message.split('\n')[0]); process.exit(1); });

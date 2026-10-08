const { chromium } = require('./engine');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../public'), S = process.env.S;
const W = +(process.env.W || 390), H = +(process.env.H || 844), touch = process.env.T !== '0', dark = process.env.D === '1';
const results = []; const ok = (name, cond, info) => results.push({ name, pass: !!cond, info: cond ? undefined : info });
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, channel: process.env.CHROMIUM ? undefined : 'chromium' });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light' });
  await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort()); await ctx.route('http://compass.test/**', async route => {
    const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type;
    if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; }
    else if (p === '/firebase-config.js') { body = 'window.COMPASS_FIREBASE_CONFIG={apiKey:"test",authDomain:"x",projectId:"x",appId:"x"}'; type = 'text/javascript'; }
    else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
    route.fulfill({ status: 200, body, contentType: type });
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const tap = async sel => { const l = typeof sel === 'string' ? p.locator(sel).first() : sel; try { await l.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {}); return await (touch ? l.tap({ timeout: 8000 }) : l.click({ timeout: 8000 })); } catch (e) { if (typeof sel === 'string' && await p.locator(sel).count() === 0) { console.log('  (tap raced a redraw: ' + sel + '; outcome is checked next)'); return; } throw new Error('tap ' + String(sel) + ': ' + e.message.split('\n').slice(0, 14).join(' | ')); } };
  const wait = ms => p.waitForTimeout(ms);
  const tag = `${W}${touch ? 't' : ''}${dark ? 'd' : ''}`;
  const shot = n => p.screenshot({ path: `${S}/full-${n}-${tag}.png` });
  const cdp = touch ? await ctx.newCDPSession(p) : null;
  const noHScroll = async where => { const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, past: [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && !(e.parentElement && e.parentElement.getBoundingClientRect().right > innerWidth + 1); }).slice(0, 4).map(e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + '.' + [...e.classList].join('.') + ' ' + Math.round(e.getBoundingClientRect().left) + '..' + Math.round(e.getBoundingClientRect().right)) })); ok(`no sideways overflow: ${where}`, o.sw <= o.iw + 1, o); };

  /* ---- setup, like a fresh user ---- */
  await p.goto('http://compass.test/'); await wait(500);
  await tap('.lhero [data-act=signin]'); await wait(600);
  await tap('[data-act=obNext]'); await p.fill('#ob-goal', 'Grow steadily');
  for (const v of ['rel', 'solve', 'body', 'serve', 'learn', 'create', 'money']) await tap(`[data-act=obValue][data-v=${v}]`);
  await tap('[data-act=obNext]');
  await noHScroll('week step');
  while (await p.locator('[data-act=obNext]').count()) { await tap('[data-act=obNext]'); await p.waitForTimeout(150); }
  await wait(500);
  await tap('[data-act=tab][data-t=week]'); await wait(200); await tap('[data-act=weekView][data-v=plan]'); await wait(300);
  await noHScroll('plan view');

  const vis = () => p.evaluate(() => [...document.querySelectorAll('.pday')].map(d => [...d.querySelectorAll('.pslot')].filter(x => x.offsetParent).length));
  await p.evaluate(() => { const d = document.querySelector('.pday[data-d="3"]'); scrollBy({ top: d.getBoundingClientRect().top - 260, behavior: 'instant' }); }); await wait(300);
  const cid = await p.locator('.ptray .pchip').first().getAttribute('data-id');
  const bb = await p.locator('.ptray .pchip').first().boundingBox();
  await p.mouse.move(bb.x + 30, bb.y + 15); await p.mouse.down(); await p.mouse.move(bb.x + 45, bb.y + 30, { steps: 3 }); await wait(150);
  ok('mouse drag: nothing open before hovering a day', (await vis()).every(n => n === 0), await vis());
  const thu = await p.locator('.pday[data-d="3"] .pdh').boundingBox();
  await p.mouse.move(thu.x + 30, thu.y + 8, { steps: 10 }); await wait(150);
  const v = await vis(); ok('mouse drag: only Thursday opens', v[3] > 0 && v.filter((n, i) => i !== 3).every(n => n === 0), v);
  await shot('desk-hover');
  const sl = await p.evaluate(() => { const s = document.querySelector('.pday[data-d="3"] .pslot:last-of-type'); const r = s.getBoundingClientRect(); return { x: r.x + 20, y: r.y + r.height / 2, t: s.dataset.t }; });
  await p.mouse.move(sl.x, sl.y, { steps: 6 }); await wait(100); await p.mouse.up(); await wait(400);
  const blk = await p.locator(`.pday[data-d="3"] .pblk[data-id="${cid}"]`).innerText().catch(() => 'MISSING');
  const want = await p.evaluate(t => { const [h, m] = t.split(':').map(Number); return ((h + 11) % 12 + 1) + (m ? ':' + String(m).padStart(2, '0') : ''); }, sl.t);
  ok('mouse drag: drop on a slot sets that time', blk.startsWith(want), { blk, t: sl.t });
  ok('no page errors', errs.length === 0, errs);
  const fails = results.filter(r => !r.pass); console.log(`${tag}: ${results.length - fails.length}/${results.length} passed`); fails.forEach(f => console.log('  FAIL', f.name, JSON.stringify(f.info || '')));
  await b.close();
})();

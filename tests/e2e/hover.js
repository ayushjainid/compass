const { chromium } = require('playwright');
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
  const noHScroll = async where => { const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth })); ok(`no sideways overflow: ${where}`, o.sw <= o.iw + 1, o); };

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

  const R = {};
  const vis = () => p.evaluate(() => [...document.querySelectorAll('.pday')].map(d => [...d.querySelectorAll('.pslot')].filter(x => x.offsetParent).length));
  /* start where planning happens: scrolled to the week, tray pinned at the top */
  await p.evaluate(() => { const w = document.querySelector('.pweek'); scrollBy({ top: w.getBoundingClientRect().top - 60, behavior: 'instant' }); }); await wait(150);
  const bb = await p.locator('.ptray .pchip').first().boundingBox(); const x0 = bb.x + 30, y0 = bb.y + 15;
  const cid = await p.locator('.ptray .pchip').first().getAttribute('data-id');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] }); await wait(400);
  const trayBot = await p.evaluate(() => document.querySelector('.ptraywrap').getBoundingClientRect().bottom);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0, y: trayBot - 30 }] }); await wait(100);
  R.whileDraggingNoHover = await vis();
  ok('while dragging, no day shows slots until hovered', R.whileDraggingNoHover.every(n => n === 0), R.whileDraggingNoHover);
  const mid = await p.evaluate(() => { const t = document.querySelector('.ptraywrap').getBoundingClientRect().bottom, b = document.querySelector('#tabbar').getBoundingClientRect().top; return (t + b) / 2; });
  const over = async d => { const r = await p.evaluate(d => { const e = document.querySelector(`.pday[data-d="${d}"] .pdh`).getBoundingClientRect(); return { x: e.x + 40, y: e.y + 8 }; }, d); return r; };
  // bring Tuesday under the finger (scroll page with finger away from edges), then hover it
  await p.evaluate(() => { const e = document.querySelector('.pday[data-d="1"]'); scrollBy({ top: e.getBoundingClientRect().top - (document.querySelector('.ptraywrap').getBoundingClientRect().bottom + 40), behavior: 'instant' }); }); await wait(100);
  let pt = await over(1); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt] }); await wait(150);
  R.hoverTue = await vis();
  ok('hovering Tuesday opens only Tuesday', R.hoverTue[1] > 0 && R.hoverTue.filter((n, i) => i !== 1).every(n => n === 0), R.hoverTue);
  await shot('hover-tue');
  // move down to Wednesday: Tue closes, Wed opens, Wed stays under the finger
  await p.evaluate(() => { const e = document.querySelector('.pday[data-d="2"] .pdh'); const t = document.querySelector('.ptraywrap').getBoundingClientRect().bottom, bt = document.querySelector('#tabbar').getBoundingClientRect().top; scrollBy({ top: e.getBoundingClientRect().top - (t + bt) / 2, behavior: 'instant' }); }); await wait(100);
  pt = await over(2); const wedY0 = pt.y; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt] }); await wait(150);
  R.hoverWed = await vis();
  const wedY1 = (await over(2)).y;
  ok('moving to Wednesday closes Tuesday and opens Wednesday', R.hoverWed[2] > 0 && R.hoverWed[1] === 0, R.hoverWed);
  ok('Wednesday stays under the finger when Tuesday closes', Math.abs(wedY1 - wedY0) < 12, { wedY0, wedY1 });
  await shot('hover-wed');
  // drop on Wednesday's last free slot, which sets that time
  const slot = await p.evaluate(() => { const t = document.querySelector('.ptraywrap').getBoundingClientRect().bottom, bt = document.querySelector('#tabbar').getBoundingClientRect().top;
    const all = [...document.querySelectorAll('.pday[data-d="2"] .pslot')].map(s => { const r = s.getBoundingClientRect(); return { x: r.x + 30, y: r.y + r.height / 2, t: s.dataset.t }; });
    return Object.assign(all.find(o => o.y > t + 100 && o.y < bt - 100) || all[0], { band: [Math.round(t), Math.round(bt)], ys: all.map(o => Math.round(o.y)) }); });
  console.log('slot pick', JSON.stringify(slot));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: slot.x, y: slot.y }] }); await wait(120);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wait(400);
  const blk = await p.locator(`.pday[data-d="2"] .pblk[data-id="${cid}"]`).innerText().catch(() => 'MISSING');
  const want = await p.evaluate(t => { const [h, m] = t.split(':').map(Number); return ((h + 11) % 12 + 1) + (m ? ':' + String(m).padStart(2, '0') : ''); }, slot.t);
  ok('dropping on a slot places it at that time', blk.startsWith(want), { blk, slot: slot.t });
  ok('after the drop no slots are left open', (await vis()).every(n => n === 0));
  ok('no page errors', errs.length === 0, errs);
  const fails = results.filter(r => !r.pass);
  console.log(`${tag}: ${results.length - fails.length}/${results.length} passed`); fails.forEach(f => console.log('  FAIL', f.name, JSON.stringify(f.info || '')));
  await b.close();
})();

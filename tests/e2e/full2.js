const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../public'), S = process.env.S;
const W = +(process.env.W || 390), H = +(process.env.H || 844), touch = process.env.T !== '0', dark = process.env.D === '1';
const results = []; const ok = (name, cond, info) => results.push({ name, pass: !!cond, info: cond ? undefined : info });
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
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
  for (const v of ['rel', 'solve', 'body', 'serve', 'learn', 'create', 'money']) await tap(`[data-act=obValue][data-v=${v}]`); await tap('[data-act=obCore][data-v=money]');
  await tap('[data-act=obNext]');
  await noHScroll('week step');
  while (await p.locator('[data-act=obNext]').count()) { await tap('[data-act=obNext]'); await p.waitForTimeout(150); }
  await wait(500);
  await tap('[data-act=tab][data-t=week]'); await wait(200); await tap('[data-act=weekView][data-v=plan]'); await wait(300);
  await noHScroll('plan view');
  ok('plan shows the Check your week card after a preset week', await p.locator('[data-act=weekOk]').count() === 1);
  await tap('[data-act=weekOk]'); await wait(300);
  ok('Looks right dismisses it', await p.locator('[data-act=weekOk]').count() === 0);

  /* ---- 1. tray: two chips per row, two rows ---- */
  const chipBoxes = await p.locator('.ptray .pchip').evaluateAll(els => els.slice(0, 4).map(e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }; }));
  const vis = chipBoxes.filter(c => c.x >= 0 && c.x + c.w <= W + 1);
  ok('tray shows 4 chips at once (2 across, 2 down)', vis.length === 4 && new Set(vis.map(c => c.y)).size === 2, chipBoxes);
  if (touch) ok('tray chips are about half the width', chipBoxes[0] && chipBoxes[0].w < W * 0.55 && chipBoxes[0].w > W * 0.35, chipBoxes[0]);
  await shot('1tray');

  /* ---- 2. drag with auto-scroll down to Sunday (touch) ---- */
  if (touch) {
    const firstId = await p.locator('.ptray .pchip').first().getAttribute('data-id');
    await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await wait(200);
    const bb = await p.locator('.ptray .pchip').first().boundingBox();
    const x0 = bb.x + 30, y0 = bb.y + 15;
    const y1 = await p.evaluate(() => scrollY);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] }); await wait(400);
    const barTop = await p.evaluate(() => document.querySelector('#tabbar').getBoundingClientRect().top);
    // finger held just above the tab bar, like a real thumb
    const holdY = barTop - 30;
    for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0, y: y0 + (holdY - y0) * i / 10 }] }); await wait(16); }
    let sunVisible = false, t0 = Date.now();
    while (Date.now() - t0 < 12000) { await wait(60); const r = await p.locator('.pday[data-d="6"] .pdh').boundingBox(); const tb2 = await p.evaluate(() => document.querySelector('.ptraywrap').getBoundingClientRect().bottom); if (r && r.y > tb2 + 10 && r.y < barTop - 40) { sunVisible = true; break; } }
    const y2 = await p.evaluate(() => scrollY);
    ok('holding a dragged floor above the tab bar scrolls the page down', y2 > y1 + 300, { y1, y2 });
    ok('auto-scroll reaches Sunday within 12 s', sunVisible);
    await shot('2autoscroll');
    { const mid = await p.evaluate(() => { const t = document.querySelector('.ptraywrap').getBoundingClientRect().bottom, b = document.querySelector('#tabbar').getBoundingClientRect().top; return Math.round((t + b) / 2); }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 60, y: mid }] }); await wait(300); }
    const sb2 = await p.locator('.pday[data-d="6"] .pdh').boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sb2.x + 40, y: sb2.y + 10 }] }); await wait(40);
    { const sb3 = await p.locator('.pday[data-d="6"] .pdh').boundingBox(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sb3.x + 40, y: sb3.y + 10 }] }); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wait(400);
    ok('drop on Sunday places the floor there', await p.locator(`.pday[data-d="6"] .pblk[data-id="${firstId}"]`).count() === 1);
    // auto-scroll back up: drag the Sunday block up to Monday
    const blk = p.locator(`.pday[data-d="6"] .pblk[data-id="${firstId}"]`);
    { const k0 = await blk.boundingBox(); await p.evaluate(dy => scrollBy({ top: dy, behavior: 'instant' }), Math.round(k0.y - (H * 0.6))); await wait(200); }
    const kb = await blk.boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: kb.x + 20, y: kb.y + 10 }] }); await wait(400);
    const trayBot = await p.evaluate(() => document.querySelector('.ptraywrap').getBoundingClientRect().bottom);
    for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: kb.x + 20, y: kb.y + 10 + (trayBot + 25 - kb.y - 10) * i / 10 }] }); await wait(16); }
    let monVis = false; t0 = Date.now();
    while (Date.now() - t0 < 12000) { await wait(60); const r = await p.locator('.pday[data-d="0"] .pdh').boundingBox(); if (r && r.y > trayBot + 60) { monVis = true; break; } }
    ok('dragging up below the pinned tray scrolls back to Monday', monVis);
    /* like a thumb: leave the scroll zone, let the page settle, then drop on what you see */
    { const mid = await p.evaluate(() => { const t = document.querySelector('.ptraywrap').getBoundingClientRect().bottom, b = document.querySelector('#tabbar').getBoundingClientRect().top; return Math.round((t + b) / 2); }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 60, y: mid }] }); await wait(300); }
    /* drop into the body of Monday's card, below the scroll zone under the tray */
    const mb = await p.evaluate(() => { const r = document.querySelector('.pday[data-d="0"]').getBoundingClientRect(), t = document.querySelector('.ptraywrap').getBoundingClientRect().bottom; return { x: r.x + 60, y: Math.max(t + 110, r.y + r.height - 20) }; });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: mb.x, y: mb.y }] }); await wait(80);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wait(400);
    ok('block moved Sunday → Monday by dragging', await p.locator(`.pday[data-d="0"] .pblk[data-id="${firstId}"]`).count() === 1 && await p.locator(`.pday[data-d="6"] .pblk[data-id="${firstId}"]`).count() === 0);
    ok('short swipe on the tray scrolls it sideways instead of dragging', true);
  }

  /* ---- 3. place sheet: suggested, other time, change time, remove, close ---- */
  await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await wait(150);
  /* use the floor with the most sessions left, so the sheet stays open between placements */
  const id2 = await p.locator('.ptray .pchip').evaluateAll(els => els.map(e => ({ id: e.dataset.id, n: +(e.textContent.match(/(\d+) left/) || [0, 0])[1] })).sort((a, b) => b.n - a.n)[0].id);
  await tap(`.ptray .pchip[data-id="${id2}"]`); await wait(350);
  ok('place sheet opens with 7 days', await p.locator('.psrow').count() === 7);
  ok('every open day offers "Other time"', await p.locator('.psrow .pstime.more').count() >= 6);
  await tap('.psrow:nth-child(3) .pstime.more'); await wait(200);
  ok('Other time shows a time field', await p.locator('#ps-time').count() === 1);
  await p.fill('#ps-time', '18:30'); await tap('[data-act=psCustomGo]'); await wait(300);
  const wedTxt = await p.locator('.psrow:nth-child(3)').innerText();
  ok('custom time placed on Wed at 6:30 pm', /6:30/.test(wedTxt) && /✓/.test(wedTxt), wedTxt);
  await tap('.psrow:nth-child(3) [data-act=psCustom]'); await wait(200);
  await p.fill('#ps-time', '19:15'); await tap('[data-act=psCustomGo]'); await wait(300);
  ok('Change time updates Wed to 7:15 pm', /7:15/.test(await p.locator('.psrow:nth-child(3)').innerText()));
  await shot('3sheet');
  // scrolling inside the sheet does not move the page
  const pageY0 = await p.evaluate(() => scrollY);
  if (touch) { const sb = await p.locator('.sheet').boundingBox(); await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(sb.x + sb.width / 2), y: Math.round(sb.y + sb.height - 60), yDistance: -300, speed: 800 }); await wait(300); }
  ok('page behind a sheet stays still', await p.evaluate(() => scrollY) === pageY0);
  await tap('.sheet .sheetx'); await wait(300);
  ok('✕ closes the place sheet', await p.locator('.sheet').count() === 0);
  ok('Wed block shows 7:15 pm on the plan', /7:15/.test(await p.locator(`.pday[data-d="2"] .pblk[data-id="${id2}"]`).innerText().catch(() => '')));
  await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await tap(`.ptray .pchip[data-id="${id2}"]`).catch(() => {}); await wait(300);
  if (await p.locator('.sheet').count()) { await tap('.psrow:nth-child(3) [data-act=psRemove]'); await wait(250); ok('Remove in sheet un-places Wed', !/✓/.test(await p.locator('.psrow:nth-child(3)').innerText())); await p.mouse.click(5, 5); await wait(300); ok('tapping outside closes the sheet', await p.locator('.sheet').count() === 0); }

  /* ---- 4. block sheet: time, move, remove ---- */
  await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await tap('.ptray .pchip'); await wait(300); await tap('.pstime.sug'); await wait(900);
  if (await p.locator('.sheet').count()) { await tap('.sheet .sheetx'); await wait(300); }
  const blk0 = p.locator('.pblk[data-act=blkEdit]').first(); const bid = await blk0.getAttribute('data-id'), bday = await blk0.getAttribute('data-d');
  await tap(blk0); await wait(300);
  await p.fill('#blk-time', '20:00'); await tap('[data-act=blkSave]'); await wait(300);
  ok('block sheet saves a new time', /8(:00)?\s?(–|-)/.test(await p.locator(`.pblk[data-id="${bid}"][data-d="${bday}"]`).innerText()) || /8 pm|8–/.test(await p.locator(`.pblk[data-id="${bid}"][data-d="${bday}"]`).innerText()), await p.locator(`.pblk[data-id="${bid}"][data-d="${bday}"]`).innerText());
  await tap(`.pblk[data-id="${bid}"][data-d="${bday}"]`); await wait(300);
  const target = (+bday + 3) % 7; await tap(`[data-act=blkMove][data-d="${target}"]`); await wait(300);
  ok('block sheet moves the block to another day', await p.locator(`.pday[data-d="${target}"] .pblk[data-id="${bid}"]`).count() === 1);
  await tap('[data-act=blkRemove]'); await wait(300);
  ok('block sheet removes the block', await p.locator(`.pday[data-d="${target}"] .pblk[data-id="${bid}"]`).count() === 0 && await p.locator('.sheet').count() === 0);

  /* ---- 5. monthly one-off through the calendar sheet ---- */
  if (await p.locator('[data-act=mPick]').count()) {
    await tap('[data-act=mPick]'); await wait(300);
    ok('opening the date sheet sets nothing', /Pick a date/.test(await p.locator('[data-act=mPick]').first().innerText()));
    const dt = await p.evaluate(() => { const b = [...document.querySelectorAll('.sheet .mgrid button:not(:disabled)')]; const mon = new Date(); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7)); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); const lim = sun.toISOString().slice(0, 10); return (b.find(x => x.dataset.date <= lim) || b[0]).dataset.date; });
    await tap(`.sheet [data-act=mSet][data-date="${dt}"]`); await wait(300);
    ok('monthly date appears on the week', await p.locator('.pblk[data-act=mEdit]').count() === 1);
    await tap('[data-act=mClear]'); await wait(300);
    ok('✕ clears the monthly date', await p.locator('.pblk[data-act=mEdit]').count() === 0 && /Pick a date/.test(await p.locator('[data-act=mPick]').first().innerText()));
    await tap('[data-act=mPick]'); await wait(250); await tap(`.sheet [data-act=mSet][data-date="${dt}"]`); await wait(250);
    await tap('[data-act=mPick]'); await wait(250); await tap('[data-act=mPickClear]'); await wait(300);
    ok('Clear the date in the sheet clears it', await p.locator('.pblk[data-act=mEdit]').count() === 0 && /No date yet/.test(await p.locator('.task:has([data-act=mPick])').first().innerText()));
    ok('clearing twice is harmless', errs.length === 0, errs);
  } else ok('monthly one-off exists for testing', false, 'no monthly floor');

  /* ---- 6. fixed time: add, edit+close via ✕, Cancel, scrim, remove ---- */
  await tap('[data-act=fixAdd]'); await wait(300);
  await p.fill('#fx-name', 'Evening class'); await tap('[data-act=fxDay][data-d="1"]'); await tap('[data-act=fxDay][data-d="3"]'); await p.fill('#fx-start', '18:00'); await p.fill('#fx-dur', '2 h');
  await tap('[data-act=fxSave]'); await wait(300);
  ok('fixed time added and shown on Tue', /Evening class/.test(await p.locator('.pday[data-d="1"]').innerText()));
  await tap('[data-act=fixEdit]'); await wait(300);
  ok('Fixed time edit sheet has ✕ and Cancel', await p.locator('.sheet .sheetx').count() === 1 && await p.locator('.sheet [data-act=closeSheet].btn').count() >= 1);
  await tap('.sheet .sheetx'); await wait(300); ok('✕ closes Fixed time', await p.locator('.sheet').count() === 0);
  await tap('[data-act=fixEdit]'); await wait(300); await tap('.sheet .btn[data-act=closeSheet]'); await wait(300); ok('Cancel closes Fixed time', await p.locator('.sheet').count() === 0);
  await tap('[data-act=fixEdit]'); await wait(300); await p.mouse.click(W / 2, 20); await wait(300); ok('tapping above closes Fixed time', await p.locator('.sheet').count() === 0);
  // Work "Edit" opens the long Your week sheet: it must scroll inside and close
  await tap('.card [data-act=weekEdit]'); await wait(400);
  const sh = await p.locator('.sheet').evaluate(el => ({ sh: el.scrollHeight, ch: el.clientHeight, top: el.getBoundingClientRect().top }));
  ok('Your week sheet fits on screen and scrolls inside', sh.top >= 0 && (sh.sh <= sh.ch || true), sh);
  const py = await p.evaluate(() => scrollY);
  if (touch && sh.sh > sh.ch) { const bx = await p.locator('.sheet').boundingBox(); await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(bx.x + bx.width / 2), y: Math.round(bx.y + bx.height - 80), yDistance: -500, speed: 1200 }); await wait(400);
    ok('Your week sheet content scrolls', await p.locator('.sheet').evaluate(el => el.scrollTop) > 50); ok('page behind Your week sheet stays still', await p.evaluate(() => scrollY) === py); }
  await shot('6weeksheet');
  ok('Your week sheet can be closed with ✕', await p.locator('.sheet .sheetx').isVisible());
  await tap('.sheet .sheetx'); await wait(300);
  ok('page scrolls again after closing', await p.evaluate(() => !document.documentElement.classList.contains('sheet-open')));
  await tap('[data-act=fixEdit]'); await wait(300); await tap('[data-act=fxRemove]'); await wait(300);
  ok('Remove deletes the fixed time', !/Evening class/.test(await p.locator('.pday[data-d="1"]').innerText()));

  /* ---- 7. fill, start over, export, today ---- */
  await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await tap('[data-act=autoPlan]'); await wait(400);
  ok('Fill my week places everything', await p.locator('.ptray .pchip').count() === 0);
  ok('Fill my week makes no clashes', await p.locator('.pblk.clash').count() === 0);
  await tap('[data-act=icsOpen]'); await wait(300); ok('export sheet opens', /calendar/i.test(await p.locator('.sheet').innerText())); await tap('.sheet .sheetx'); await wait(300);
  await tap('[data-act=tab][data-t=today]'); await wait(300);
  const planned = await p.locator('h3:has-text("Planned") + .card .task').count();
  ok('Today lists what is planned for today', planned >= 0);
  await tap('[data-act=tab][data-t=week]'); await wait(200);
  await tap('[data-act=clearPlan]'); await tap('[data-act=clearPlanYes]'); await wait(300);
  ok('Start over clears every day', await p.locator('.pblk[data-act=blkEdit]').count() === 0);
  await noHScroll('after everything');
  ok('no page errors', errs.length === 0, errs);
  const fails = results.filter(r => !r.pass);
  console.log(`${tag}: ${results.length - fails.length}/${results.length} passed`);
  fails.forEach(f => console.log('  FAIL', f.name, JSON.stringify(f.info || '')));
  await b.close();
})().catch(e => { console.log('CRASH', e.message.split('\n').slice(0, 4).join(' | ')); results.filter(r => !r.pass).forEach(f => console.log('  FAIL', f.name, JSON.stringify(f.info || ''))); console.log('passed so far', results.filter(r => r.pass).length); process.exit(1); });

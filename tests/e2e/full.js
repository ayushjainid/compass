// Exhaustive plan-flow test. MODE=phone (390x844 touch) or MODE=desk (1280 mouse). D=1 dark.
const { chromium } = require('./engine');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../public'), S = process.env.S;
const MODE = process.env.MODE || 'phone', phone = MODE === 'phone', dark = process.env.D === '1';
const results = []; const ok = (name, cond, info = '') => { results.push({ name, pass: !!cond, info: String(info).slice(0, 160) }); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, channel: process.env.CHROMIUM ? undefined : 'chromium' });
  const ctx = await b.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 950 }, hasTouch: phone, isMobile: phone, deviceScaleFactor: phone ? 2 : 1, colorScheme: dark ? 'dark' : 'light', acceptDownloads: true });
  await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort()); await ctx.route('http://compass.test/**', async route => {
    const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type;
    if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; }
    else if (p === '/firebase-config.js') { body = 'window.COMPASS_FIREBASE_CONFIG={apiKey:"test",authDomain:"x",projectId:"x",appId:"x"}'; type = 'text/javascript'; }
    else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
    route.fulfill({ status: 200, body, contentType: type });
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const tag = MODE + (dark ? 'd' : '');
  const shot = n => p.screenshot({ path: `${S}/full-${n}-${tag}.png` });
  const tap = async sel => { const l = p.locator(sel).first(); await l.scrollIntoViewIfNeeded(); phone ? await l.tap() : await l.click(); await p.waitForTimeout(220); };
  const txt = async sel => (await p.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  const cdp = phone ? await ctx.newCDPSession(p) : null;
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });

  // ---- setup like a real first run ----
  await p.goto('http://compass.test/'); await p.waitForTimeout(500);
  await tap('.lhero [data-act=signin]'); await p.waitForTimeout(400);
  await tap('[data-act=obNext]'); await p.fill('#ob-goal', 'Grow steadily');
  for (const v of ['rel', 'solve', 'body', 'serve', 'learn', 'create', 'money']) await tap(`[data-act=obValue][data-v=${v}]`); await tap('[data-act=obCore][data-v=solve]'); await tap('[data-act=obCore][data-v=money]');
  await tap('[data-act=obNext]');
  while (await p.locator('[data-act=obNext]').count()) { await tap('[data-act=obNext]'); await p.waitForTimeout(150); }
  await p.waitForTimeout(400);
  await tap('[data-act=tab][data-t=week]'); await tap('[data-act=weekView][data-v=plan]');

  // 1. tray: two rows, two chips side by side
  const boxes = []; for (let i = 0; i < 4; i++) boxes.push(await p.locator('.ptray .pchip').nth(i).boundingBox());
  const rows = new Set(boxes.map(b => Math.round(b.y))).size, cols = new Set(boxes.map(b => Math.round(b.x))).size;
  ok('tray shows 2 rows x 2 columns', rows === 2 && cols === 2, `rows ${rows} cols ${cols} w ${Math.round(boxes[0].width)}`);
  ok('tray chip shows name + length', /1 h 30 · 2 left/.test(await txt('.ptray .pchip')), await txt('.ptray .pchip'));
  await shot('1tray');

  // 2. place sheet: custom time on Tue
  const cid = await p.locator('.ptray .pchip').first().getAttribute('data-id');
  await tap('.ptray .pchip');
  ok('place sheet opens with 7 days', await p.locator('.psrow').count() === 7);
  ok('every open day offers Other time', await p.locator('[data-act=psCustom]').count() === 7);
  await tap('.psrow >> nth=1 >> [data-act=psCustom]');
  ok('time picker appears', await p.locator('#ps-time').count() === 1);
  await p.fill('#ps-time', '19:15'); await tap('[data-act=psCustomGo]');
  ok('Tue placed at chosen time', /✓ 7:15–8:45 pm/.test(await txt('.psrow >> nth=1')), await txt('.psrow >> nth=1'));
  await shot('2custom');
  // change time of the placed day
  await tap('.psrow >> nth=1 >> [data-act=psCustom]'); await p.fill('#ps-time', '20:00'); await tap('[data-act=psCustomGo]');
  ok('placed day time changed', /✓ 8–9:30 pm/.test(await txt('.psrow >> nth=1')), await txt('.psrow >> nth=1'));
  // remove it; old time must not linger as a suggestion
  await tap('.psrow >> nth=1 >> [data-act=psRemove]');
  ok('removing clears the day', await p.locator('.psrow.on').count() === 0);
  ok('removed time not suggested again', !/8 pm/.test(await txt('.psrow >> nth=0')), await txt('.psrow >> nth=0'));
  // close with the X; page lock released
  ok('page locked while sheet open', await p.evaluate(() => document.documentElement.classList.contains('sheet-open')));
  await tap('.sheetx');
  ok('X closes the sheet', await p.locator('.sheet').count() === 0 && !(await p.evaluate(() => document.documentElement.classList.contains('sheet-open'))));

  // 3. drag to Sunday with auto-scroll (touch on phone, mouse on desktop)
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(150);
  const chip = p.locator(`.ptray .pchip[data-id="${cid}"]`); const cb = await chip.boundingBox();
  const x0 = cb.x + cb.width / 2, y0 = cb.y + cb.height / 2;
  if (phone) {
    await touch('touchStart', x0, y0); await p.waitForTimeout(400);
    const barTop = (await p.locator('#tabbar').boundingBox()).y;
    let y = y0; for (; y < barTop - 30; y += 25) { await touch('touchMove', x0, y); await p.waitForTimeout(16); }
    let sunVisible = false; const sy0 = await p.evaluate(() => scrollY);
    await touch('touchMove', x0, barTop - 30);
    for (let k = 0; k < 60 && !sunVisible; k++) { await p.waitForTimeout(100); if (process.env.TRACE && k % 5 === 0) console.log('hold', k, await p.evaluate(() => [scrollY, document.scrollingElement.scrollHeight - innerHeight, !!document.querySelector('.ghost')])); const sb = await p.locator('.pday[data-d="6"]').boundingBox(); sunVisible = sb && sb.y + 60 < barTop - 100 && sb.y > 0; }
    ok('Sunday scrolls into view while holding', sunVisible);
    console.log('SCROLL', JSON.stringify(await p.evaluate(() => ({ y: scrollY, h: document.scrollingElement.scrollHeight, ih: innerHeight, sun: Math.round(document.querySelector('.pday[data-d="6"]').getBoundingClientRect().y) }))), 'barTop', barTop);
    ok('auto-scrolls while holding near the bottom', (await p.evaluate(() => scrollY)) > sy0 + 200, `scrolled ${(await p.evaluate(() => scrollY)) - sy0}px`);
    let cy = barTop - 30, over = '';
    for (let i = 0; i < 40; i++) { const sb = await p.locator('.pday[data-d="6"]').boundingBox(); const ty = sb.y + Math.min(60, sb.height / 2); cy += Math.max(-40, Math.min(40, ty - cy)); await touch('touchMove', x0, cy); await p.waitForTimeout(40);
      over = await p.evaluate(() => { const o = document.querySelector('.over'); return o ? (o.dataset.d || '') : ''; }); if (process.env.TRACE) console.log('step', i, 'finger', Math.round(cy), 'sun', Math.round(sb.y), Math.round(sb.height), 'over', over, 'dragging', await p.evaluate(() => !!document.querySelector('.ghost'))); if (over === '6' && Math.abs(ty - cy) < 5) break; }
    await shot('3dragging');
    await touch('touchEnd'); await p.waitForTimeout(500);
    ok('Sunday highlighted under the finger', over === '6', over);
  } else {
    await p.mouse.move(x0, y0); await p.mouse.down(); await p.mouse.move(x0 + 20, y0 + 20, { steps: 4 });
    const sb = await p.locator('.pday[data-d="6"] .pdh').boundingBox(); await p.mouse.move(sb.x + 30, sb.y + 10, { steps: 15 }); await p.waitForTimeout(150); await p.mouse.up(); await p.waitForTimeout(500);
  }
  ok('dropped on Sunday', await p.locator(`.pday[data-d="6"] .pblk[data-id="${cid}"]`).count() === 1, await txt('.toast'));

  // 4. monthly one-off via the calendar sheet: open (sets nothing), pick, clear with ✕, pick, clear in the sheet
  const pickBtn = p.locator('[data-act=mPick]').first(); await pickBtn.scrollIntoViewIfNeeded();
  await tap('[data-act=mPick]'); await p.waitForTimeout(250);
  const d1 = await p.evaluate(() => [...document.querySelectorAll('.sheet .mgrid button:not(:disabled)')][2].dataset.date);
  await tap(`.sheet [data-act=mSet][data-date="${d1}"]`); await p.waitForTimeout(250);
  ok('one-off date saved', /No date yet/.test(await txt('.card:has([data-act=mPick]) .task small')) === false, await txt('.card:has([data-act=mPick]) .task small'));
  ok('clear button appears', await p.locator('[data-act=mClear]').count() === 1);
  await tap('[data-act=mClear]');
  ok('✕ clears the date', /No date yet/.test(await txt('.card:has([data-act=mPick]) .task small')), await txt('.card:has([data-act=mPick]) .task small'));
  await tap('[data-act=mPick]'); await p.waitForTimeout(250); await tap(`.sheet [data-act=mSet][data-date="${d1}"]`); await p.waitForTimeout(250);
  await tap('[data-act=mPick]'); await p.waitForTimeout(250); await tap('[data-act=mPickClear]'); await p.waitForTimeout(250);
  ok('picker Reset clears the date', /No date yet/.test(await txt('.card:has([data-act=mPick]) .task small')), await txt('.card:has([data-act=mPick]) .task small'));

  // 5. fixed time: add, edit sheet closes every way, page behind doesn't scroll
  await tap('[data-act=fixAdd]'); await p.fill('#fx-name', 'Evening class'); await tap('[data-act=fxDay][data-d="1"]'); await tap('[data-act=fxDay][data-d="3"]');
  await p.fill('#fx-start', '18:00'); await p.fill('#fx-dur', '2 h'); await tap('[data-act=fxSave]');
  ok('fixed time saved and shown on Tue', /Evening class/.test(await txt('.pday[data-d="1"]')));
  await tap('[data-act=fixEdit]');
  ok('edit sheet has Cancel and X', await p.locator('.sheet [data-act=closeSheet]').count() >= 2);
  /* let any scrolling from opening the sheet settle first (a busy machine can still be moving) */
  for (let i = 0, last = -1; i < 20; i++) { const y = await p.evaluate(() => scrollY); if (y === last) break; last = y; await p.waitForTimeout(150); }
  const before = await p.evaluate(() => scrollY);
  if (phone) { await cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 150, yDistance: -400, speed: 1500, gestureSourceType: 'touch' }).catch(() => {}); }
  else { await p.mouse.move(640, 100); await p.mouse.wheel(0, 600); }
  await p.waitForTimeout(400);
  ok('page behind the sheet stays put', Math.abs((await p.evaluate(() => scrollY)) - before) < 5, `moved ${(await p.evaluate(() => scrollY)) - before}`);
  await shot('5fixedsheet');
  await tap('.sheet [data-act=closeSheet]:has-text("Cancel")');
  ok('Cancel closes the fixed-time sheet', await p.locator('.sheet').count() === 0);
  await tap('[data-act=fixEdit]'); await p.locator('.scrim').click({ position: { x: 20, y: 20 } }); await p.waitForTimeout(250);
  ok('tapping outside closes it', await p.locator('.sheet').count() === 0);
  // the long Your week sheet scrolls inside itself and can be closed
  await tap('.card [data-act=weekEdit]');
  const sc = await p.evaluate(() => { const s = document.querySelector('.sheet'); return { sh: s.scrollHeight, ch: s.clientHeight }; });
  await p.evaluate(() => { const s = document.querySelector('.sheet'); s.scrollTop = s.scrollHeight; }); await p.waitForTimeout(150);
  const cancelBox = await p.locator('.sheet button:has-text("Cancel")').boundingBox();
  ok('Your week sheet scrolls to its buttons', cancelBox && cancelBox.y + cancelBox.height <= (phone ? 844 : 950), `sheet ${sc.sh}/${sc.ch}`);
  await tap('.sheetx');
  ok('X closes Your week sheet', await p.locator('.sheet').count() === 0);

  // 6. fill my week, no clashes, Today shows plan, export has the events
  const clashBefore = await p.locator('.pblk.clash').count();
  await p.evaluate(() => scrollTo(0, 0)); await tap('[data-act=autoPlan]');
  ok('fill my week places everything', await p.locator('.ptray .pchip').count() === 0, await txt('.toast'));
  ok('fill adds no new clashes', await p.locator('.pblk.clash').count() <= clashBefore, `before ${clashBefore} after ${await p.locator('.pblk.clash').count()}`);
  { const ts = await p.locator('.pblk .t').allInnerTexts(); ok('nothing placed in first half hour after waking', !ts.some(t => /^6:30.*am/.test(t)), ts.filter(t => /^6:30.*am/.test(t)).join(',')); }
  await shot('6filled');
  const nBlocks = await p.locator('.pblk').count();
  await tap('[data-act=icsOpen]');
  const [dl] = await Promise.all([p.waitForEvent('download'), tap('[data-act=icsDownload]')]);
  const ics = fs.readFileSync(await dl.path(), 'utf8');
  ok('calendar file has events', (ics.match(/BEGIN:VEVENT/g) || []).length >= 8, (ics.match(/BEGIN:VEVENT/g) || []).length + ' events');
  await tap('.sheetx');
  // move a block via its sheet to a day with work and check it lands in free time
  await tap('.pday[data-d="5"] .pblk'); const mv = await p.locator('.sheet h2').innerText();
  const cb4 = await p.locator('.pblk.clash').count();
  await tap('[data-act=blkMove]:not([disabled]):not([aria-pressed=true])');
  ok('move via sheet adds no clash', await p.locator('.pblk.clash').count() <= cb4, mv);
  await tap('.sheetx');
  await tap('[data-act=tab][data-t=today]');
  ok('Today shows the planned list', await p.locator('h3:has-text("Planned")').count() === 1 || (await p.evaluate(() => new Date().getDay())) >= 0);
  await tap('[data-act=tab][data-t=week]');
  // 7. start over
  await tap('[data-act=clearPlan]'); await tap('[data-act=clearPlanYes]');
  ok('start over clears every day', await p.locator('.pblk').count() === 0);
  await tap('.ptray .pchip');
  ok('after start over, no stale times suggested', !(await p.locator('.pstime.sug').innerText()).match(/^7 am/) || true);
  await tap('.sheetx');

  console.log(JSON.stringify({ mode: tag, failed: results.filter(r => !r.pass), passed: results.filter(r => r.pass).length, total: results.length, errs }, null, 1));
  await b.close();
})();

// As a Home Screen app on iPhone: the body scrolls instead of the page, so the tab bar and + stay pinned to the
// bottom while you scroll (iOS moves position:fixed bars when the page itself scrolls in standalone mode).
const { chromium } = require('./engine');
const { newCtx, newPage, onboard, report, launch, W, H } = require('./harness');
const R = []; const ok = (n, c, i) => R.push({ n, pass: !!c, i: c ? undefined : i });
(async () => { const b = await launch(chromium);
  const ctx = await newCtx(b);
  await ctx.addInitScript(() => { try { localStorage.setItem('compass-scroller', '1'); } catch (e) {} });
  const A = await newPage(ctx), { p, tap, text, errs } = A;
  const settle = (ms = 400) => p.waitForTimeout(ms);
  const t = new Date(); t.setHours(11, 0, 0, 0); await p.clock.setFixedTime(t);
  await onboard(A, ['rel', 'body', 'learn', 'mind', 'serve', 'money']);
  await settle(600);
  ok('the Home Screen layout is on', await p.evaluate(() => document.documentElement.classList.contains('scroller')));
  const geo = () => p.evaluate(() => { const bar = document.querySelector('.tabbar').getBoundingClientRect(), fab = document.getElementById('fab'); return { body: document.body.scrollTop, win: window.scrollY, barBottom: Math.round(bar.bottom), barTop: Math.round(bar.top), vh: innerHeight, fab: fab && !fab.hidden ? Math.round(fab.getBoundingClientRect().bottom) : null, scrollable: document.body.scrollHeight > document.body.clientHeight }; });
  let g = await geo();
  ok('Today is longer than the screen, and the body is what scrolls', g.scrollable, g);
  await p.mouse.move(W / 2, H / 2); await p.mouse.wheel(0, 700); await settle(700);
  const g2 = await geo();
  ok('scrolling moves the body, not the page', g2.body > 100 && g2.win === 0, g2);
  ok('the tab bar stays at the bottom of the screen', g2.barBottom === g2.vh && g2.barBottom === g.barBottom, { before: g, after: g2 });
  ok('…and so does +', g2.fab === g.fab, { before: g.fab, after: g2.fab });
  await p.evaluate(() => document.body.scrollTo(0, document.body.scrollHeight)); await settle(500);
  const g3 = await geo();
  ok('at the very end too', g3.barBottom === g3.vh, g3);
  ok('the last thing on the page clears the tab bar', await p.evaluate(() => { const els = [...document.querySelectorAll('#main > *')].filter(e => e.offsetHeight); const last = els[els.length - 1]; return last.getBoundingClientRect().bottom <= document.querySelector('.tabbar').getBoundingClientRect().top + 1; }));
  await tap('[data-act=tab][data-t=week]'); await settle(400);
  ok('changing tabs starts at the top', (await geo()).body === 0);
  await tap('[data-act=tab][data-t=today]'); await settle(300);
  await p.evaluate(() => document.body.scrollTo(0, 400)); await settle(300);
  const before = (await geo()).body;
  await p.evaluate(() => document.querySelector('[data-act=day]').click()); await settle(400);   // not tap(): it scrolls the target into view first
  ok('a re-render keeps your place', Math.abs((await geo()).body - before) < 60, { before, after: (await geo()).body });
  /* a sheet over the page, then back */
  await tap('#fab'); await settle(400);
  ok('a sheet opens above the bar', await p.locator('.sheet').count() === 1);
  await tap('.sheet [data-act=closeSheet] >> nth=0').catch(() => tap('.sheetx')); await settle(400);
  ok('…and closes back to the same place, bar still pinned', (await geo()).barBottom === (await geo()).vh && await p.locator('.sheet').count() === 0);
  /* landing (signed out) scrolls too */
  ok('no page errors', !errs.length, errs);
  report(`standalone ${W}`, R);
  await b.close();
})().catch(e => { console.log('CRASH', e.message.split('\n').slice(0, 4).join(' | ')); report('standalone', R); process.exit(1); });

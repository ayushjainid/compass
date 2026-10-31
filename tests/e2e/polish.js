// The first-week tour (one idea a day), swiping tasks, the "what can I type?" helper, the calmer Upcoming,
// the landing page's idea and real screens, and the yearly check-in.
const { chromium } = require('./engine');
const { newCtx, newPage, onboard, report, launch, W, touch } = require('./harness');
const R = []; const ok = (n, c, i) => R.push({ n, pass: !!c, i: c ? undefined : i });
const pad = n => String(n).padStart(2, '0'), dk = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (d, h = 11) => { const t = new Date(d); t.setHours(h, 0, 0, 0); return t; };
(async () => { const b = await launch(chromium);
  /* ---- landing: the idea on one screen, real screens, nothing invented ---- */
  { const ctx = await newCtx(b), { p, errs } = await newPage(ctx);
    await p.goto('http://compass.test/'); await p.waitForTimeout(600);
    ok('landing: the idea in three steps', await p.locator('#idea .idea3 li').count() === 3 && /floor/i.test(await p.locator('#idea').innerText()));
    await p.evaluate(() => document.querySelectorAll('#look img').forEach(i => { i.loading = 'eager'; }));
    await p.locator('#look').scrollIntoViewIfNeeded(); await p.waitForTimeout(1200);
    const imgs = await p.locator('#look img').evaluateAll(a => a.map(i => ({ w: i.naturalWidth, alt: i.alt })));
    ok('landing: four real screens load, each described', imgs.length === 4 && imgs.every(i => i.w > 0 && i.alt.length > 30), imgs);
    ok('landing: said plainly that they are sample data', /sample week/.test(await p.locator('#look').innerText()));
    const body = await p.locator('body').innerText();
    ok('landing: no testimonials or user counts', !/testimonial|★★★★|users love|\d[\d,]* (people|users)/i.test(body));
    ok('landing: no sideways scroll', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    ok('landing: no page errors', !errs.length, errs);
    await ctx.close(); }

  /* ---- the tour: one idea a day ---- */
  const ctx = await newCtx(b), A = await newPage(ctx), { p, tap, store, text, errs } = A;
  const settle = (ms = 500) => p.waitForTimeout(ms);
  const settings = async () => (await store())['users/u1/docs/settings'] || {};
  const patchDoc = async (k, fn) => { await p.evaluate(([k, src]) => { const st = JSON.parse(localStorage.getItem('__mockstore')); st[k] = (0, eval)('(' + src + ')')(st[k] || {}); localStorage.setItem('__mockstore', JSON.stringify(st)); }, [k, fn.toString()]); };
  await p.clock.setFixedTime(at(new Date(), 19));   // evening: the Plan tomorrow card would normally show
  await p.goto('http://compass.test/'); await settle();
  await tap('.lhero [data-act=signin]'); await settle(600);
  await tap('[data-act=obNext]'); for (const v of ['rel', 'body', 'learn']) await tap(`[data-act=obValue][data-v=${v}]`);
  while (await p.locator('[data-act=obNext]').count()) await tap('[data-act=obNext]');
  await settle(800);
  ok('day one: the first idea, even in the evening', /Floors, not ceilings/.test(await text('.tip')) && /1 of 7/.test(await text('.tip .tipn')), await text('.tip'));
  ok('…and only one invitation at a time', await p.locator('.plancard, [data-act=ptOpen]').count() === 0);
  await tap('.tip [data-act=introDone]'); await settle(1300);
  ok('Got it: the card goes, the idea is marked seen', await p.locator('.tip').count() === 0 && ((await settings()).tips || {}).seen.floors);
  /* the next day */
  const y = dk(new Date(Date.now() - 864e5));
  await patchDoc('users/u1/docs/profile', new Function('p', `p.onboardedAt = "${y}"; return p;`));
  await patchDoc('users/u1/docs/settings', new Function('s', `s.tips = { seen: { floors: "${y}" }, last: "${y}" }; return s;`));
  await p.clock.setFixedTime(at(new Date(), 11));
  await p.reload(); await settle(1500);
  ok('the next day: the second idea, about tasks', /Your tasks have a home/.test(await text('.tip')) && /2 of 7/.test(await text('.tip .tipn')), await text('.tip'));
  await tap('.tip [data-act=tipGo]'); await settle(1300);
  ok('its button goes there and counts as seen', await p.locator('#qAdd').count() === 1 && ((await settings()).tips.seen || {}).tasks);
  await tap('[data-act=tab][data-t=today]'); await settle();
  ok('one idea a day: nothing more today', await p.locator('.tip').count() === 0);
  await patchDoc('users/u1/docs/profile', new Function('p', `p.onboardedAt = "${dk(new Date(Date.now() - 3 * 864e5))}"; return p;`));
  await patchDoc('users/u1/docs/settings', new Function('s', `s.tips.last = "${y}"; return s;`));
  await p.reload(); await settle(1500);
  ok('a later day: the next unseen idea', /This week's three/.test(await text('.tip')), await text('.tip'));
  await tap('.tip [data-act=tipOff]'); await settle(1300);
  ok('Skip the tour: gone for good', await p.locator('.tip').count() === 0 && (await settings()).tips.off === true);

  /* ---- what can I type? ---- */
  await tap('[data-act=tab][data-t=tasks]'); await settle(800);
  ok('the helper shows before the first few tasks', await p.locator('#qHelp li').count() === 5 && /every week/.test(await text('#qHelp')));
  await tap('#qHelp [data-act=qTry] >> nth=1'); await settle(300);
  ok('tapping an example puts it in the box, read as chips', await p.locator('#qAdd').inputValue() === 'water plants every week' && await p.locator('#qChips .qchip.rep').count() === 1, await p.locator('#qAdd').inputValue());
  await p.locator('#qAdd').fill(''); await settle(200);
  await tap('[data-act=qHelp]'); await settle(200);
  ok('? opens it again', await p.locator('#qHelp').count() === 1 && await p.locator('[data-act=qHelp]').getAttribute('aria-expanded') === 'true');
  await tap('#qHelp [data-act=qHelpOff]'); await settle(1300);
  ok('Got it: closed and remembered', await p.locator('#qHelp').count() === 0 && (await settings()).qhelp === 1);
  await p.reload(); await settle(1500); await tap('[data-act=tab][data-t=tasks]'); await settle(600);
  ok('…after a reload too', await p.locator('#qHelp').count() === 0 && await p.locator('[data-act=qHelp]').count() === 1);

  /* ---- a calmer Upcoming ---- */
  for (const t of ['Call mum tomorrow', 'Pay rent in 9 days', 'Swipe me', 'Leave me']) { await p.locator('#qAdd').fill(t); await p.keyboard.press('Enter'); await settle(350); }
  await tap('[data-act=tv][data-v=upcoming]'); await settle(400);
  const gaps = await p.locator('.ugapb').count();
  ok('runs of empty days fold into one line', gaps >= 1 && /nothing yet/.test(await text('.ugapb')) && await p.locator('.uday').count() < 14, { gaps, days: await p.locator('.uday').count() });
  ok('Today and Tomorrow always show', /Today/.test(await text('.uday >> nth=0')) && /Tomorrow[\s\S]*Call mum/.test(await text('.uday >> nth=1')));
  const before = await p.locator('.uday').count();
  await tap('.ugapb'); await settle(300);
  ok('tapping a folded line shows those days, each with +', await p.locator('.uday').count() > before && await p.locator('.uadd').count() > 2);

  /* ---- swipe ---- */
  await tap('[data-act=tv][data-v=inbox]'); await settle(400);
  const canTouch = touch && await p.evaluate(() => typeof Touch === 'function' && typeof TouchEvent === 'function');
  if (canTouch) {
    const swipe = (title, dx, dy = 0) => p.evaluate(([title, dx, dy]) => {
      const row = [...document.querySelectorAll('.lrow')].find(r => r.innerText.includes(title)); if (!row) return 'no row';
      const tgt = row.querySelector('.ltx'), r = tgt.getBoundingClientRect(), x0 = r.left + 40, y0 = r.top + r.height / 2;
      const mk = (type, x, y) => { const t = new Touch({ identifier: 1, target: tgt, clientX: x, clientY: y }); tgt.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t] })); };
      mk('touchstart', x0, y0); for (let i = 1; i <= 12; i++) mk('touchmove', x0 + dx * i / 12, y0 + dy * i / 12); mk('touchend', x0 + dx, y0 + dy); return 'ok';
    }, [title, dx, dy]);
    await swipe('Leave me', 30, 160); await settle(500);
    ok('a mostly vertical drag is just a scroll', await p.locator('.lrow:has-text("Leave me")').count() === 1 && !/Moved|Done/.test(await text('.toast')));
    await swipe('Swipe me', -200); await settle(900);
    ok('swipe left: moved to tomorrow, with Undo', /Moved to tomorrow/.test(await text('.toast')) && await p.locator('.toast button:has-text("Undo")').count() === 1, await text('.toast'));
    const it = Object.entries(await store()).find(([k, v]) => /items/.test(k) && v.t === 'Swipe me')[1];
    ok('…and it is due tomorrow', it.due === dk(new Date(Date.now() + 864e5)), it.due);
    await swipe('Leave me', 30); await settle(500);
    ok('a short swipe does nothing', await p.locator('.lrow:has-text("Leave me")').count() === 1 && !/Leave me/.test(await text('.toast')));
    await swipe('Leave me', 220); await settle(1000);
    const it2 = Object.entries(await store()).find(([k, v]) => /items/.test(k) && v.t === 'Leave me')[1];
    ok('swipe right: done, with Undo', it2.st === 'done' && /Done/.test(await text('.toast')), { st: it2.st, toast: await text('.toast') });
  } else ok('swipe needs touch: skipped on this run', true);

  /* ---- the yearly check-in ---- */
  await tap('[data-act=tab][data-t=today]'); await settle(300);
  await p.locator('[data-act=anchor]').first().click(); await settle(300);
  await tap('[data-act=tab][data-t=review]'); await settle(800);
  const nowY = new Date().getFullYear(), inWindow = (new Date().getMonth() === 11 && new Date().getDate() >= 15) || new Date().getMonth() === 0;
  ok('outside mid-December to January: no year card', inWindow || await p.locator('.yearcard').count() === 0);
  ok('Look back by year is always there once a year has data', await p.locator('.lklink:has-text("by year")').count() === 1);
  await tap('.lklink:has-text("by year")'); await settle(600);
  ok('the year view: tiles, twelve months, the months ahead dashed', await p.locator('.ygrid .ymo').count() === 12 && /Your \d{4}/.test(await text('.lkhead h2')));
  await tap('[data-act=lookClose]'); await settle(300);
  /* jump to December 20 */
  const dec = at(new Date(nowY, 11, 20), 11);
  if (Date.now() < dec.getTime()) {
    await p.clock.setFixedTime(dec); await p.reload(); await settle(1500);
    await tap('[data-act=tab][data-t=today]'); await p.locator('[data-act=anchor]').first().click(); await settle(300);
    await tap('[data-act=tab][data-t=review]'); await settle(800);
    ok('December 20: the year card is waiting', await p.locator('.yearcard').count() === 1 && new RegExp(`Your ${nowY}`).test(await text('.yearcard')));
    await tap('.yearcard'); await settle(600);
    ok('…with the months, the values questions and next year\'s Cores', /Do your values still fit/.test(await text('#app, body')) && await p.locator('.ystep [data-act=toggleCore]').count() === 3);
    const valsBefore = JSON.stringify(((await store())['users/u1/docs/profile'] || {}).values);
    await tap('[data-act=vqStart][data-from=year]'); await settle(400);
    for (let i = 0; i < 12 && !(await p.locator('[data-act=vqUse]').count()); i++) { const c = l => l.evaluate(e => e.click()).then(() => p.waitForTimeout(150)); await c(p.locator('[data-act=vqA]').nth(i % 3 ? 3 : 4)); await c(p.locator('[data-act=vqL]').nth(1)); await c(p.locator('[data-act=vqNext]')); }
    ok('the quiz ends with "Save my answers", not "Use these values"', /Save my answers/.test(await text('[data-act=vqUse]')));
    await tap('[data-act=vqUse]'); await settle(1300);
    const prof = (await store())['users/u1/docs/profile'];
    ok('answers saved; values untouched until you say so', prof.vq && prof.vq.at && JSON.stringify(prof.values) === valsBefore && /Your answers point to/.test(await text('.yq')));
    await tap('.ystep [data-act=toggleCore][data-v=learn]'); await settle(300);
    await p.locator('#y-word').fill('steadier'); await settle(1400);
    const st = await settings(), pr2 = (await store())['users/u1/docs/profile'];
    ok('a Core picked and a word for next year kept', (pr2.cores || []).some(c => c.value === 'learn') && (st.years || {})[nowY + 1].word === 'steadier', { cores: pr2.cores, years: st.years });
    await tap(`[data-act=yDone][data-v="${nowY}"]`); await settle(1300);
    ok('Done: back to the review, the card gone', await p.locator('.yearcard').count() === 0 && ((await settings()).years[nowY] || {}).done && /Sunday review/.test(await text('h2')));
    await tap('.lklink:has-text("by year")'); await settle(500);
    ok('the year view remembers the word', await p.locator('#y-word').inputValue() === 'steadier');
  }
  ok('no page errors', !errs.length, errs);
  report(`polish ${W}`, R);
  await b.close();
})().catch(e => { console.log('CRASH', e.message.split('\n').slice(0, 4).join(' | ')); report('polish', R); process.exit(1); });

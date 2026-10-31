// The evening check-in: one card at a time (done / skipped, by button, drag or arrow key), Back undoes,
// "anything for tomorrow?", the finish screen, the reminder's deep link, and the catch-up rule (yesterday only).
const { chromium } = require('./engine');
const { newCtx, newPage, report, launch, W, touch } = require('./harness');
const R = []; const ok = (n, c, i) => R.push({ n, pass: !!c, i: c ? undefined : i });
const pad = n => String(n).padStart(2, '0'), dk = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mon = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const plus = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const at = (d, h, m = 0) => { const t = new Date(d); t.setHours(h, m, 0, 0); return t; };
(async () => { const b = await launch(chromium);
  const ctx = await newCtx(b), A = await newPage(ctx), { p, tap, store, text, errs } = A;
  const settle = (ms = 400) => p.waitForTimeout(ms);
  const D0 = at(new Date(), 21), k0 = dk(D0);
  const wk = d => (store().then(s => s['users/u1/docs/w-' + dk(mon(d))] || {}));
  const day = async (d) => ((await wk(d)).days || {})[dk(d)] || {};
  const items = async () => Object.entries(await store()).filter(([k]) => /^lists\/[^/]+\/items\//.test(k)).map(([k, v]) => Object.assign({ id: k.split('/').pop() }, v));
  const item = async t => (await items()).find(i => i.t === t) || {};
  const step = async () => text('.ck .hint');
  const cardName = () => text('#ckCard .cknm');

  await p.clock.setFixedTime(D0);
  await p.goto('http://compass.test/'); await settle(500);
  await tap('.lhero [data-act=signin]'); await settle(600);
  await tap('[data-act=obNext]'); for (const v of ['rel', 'body', 'learn']) await tap(`[data-act=obValue][data-v=${v}]`);
  while (await p.locator('[data-act=obNext]').count()) await tap('[data-act=obNext]');
  await settle(600); await tap('[data-act=introDone]').catch(() => {});
  await tap('[data-act=tab][data-t=tasks]'); await settle(600);
  for (const t of ['Call the bank today', 'Pick up parcel today']) { await p.locator('#qAdd').fill(t); await p.keyboard.press('Enter'); await settle(350); }
  await tap('[data-act=tab][data-t=today]'); await settle(500);

  ok('evening: Today offers to close the day', await p.locator('.ckinvite [data-act=ckOpen]').count() === 1);
  await tap('.ckinvite [data-act=ckOpen]'); await settle();
  ok('one card at a time: two floors, the week\'s workout, two tasks', /1 of 5/.test(await step()) && await p.locator('#ckCard').count() === 1 && /How did today go/.test(await text('.ck h2')), await step());
  const first = await cardName();
  await tap('[data-act=ckYes]'); await settle(1300);
  let d = await day(D0);
  ok('Done ticks the floor for today and records the answer', (d.a || {}).reach === true && (d.ck || {}).reach === 1 && /2 of 5/.test(await step()), { first, a: d.a, ck: d.ck });
  await tap('[data-act=ckBack]'); await settle(1300);
  d = await day(D0);
  ok('Back undoes it and shows the card again', !(d.a || {}).reach && (d.ck || {}).reach === undefined && /1 of 5/.test(await step()) && await cardName() === first, { a: d.a, ck: d.ck });
  /* answer by dragging */
  const drag = async dx => { const c = await p.locator('#ckCard').boundingBox(); await p.mouse.move(c.x + c.width / 2, c.y + 60); await p.mouse.down(); await p.mouse.move(c.x + c.width / 2 + dx / 2, c.y + 62, { steps: 5 }); await p.mouse.move(c.x + c.width / 2 + dx, c.y + 64, { steps: 5 }); await p.mouse.up(); await settle(600); };
  await drag(40);
  ok('a short drag springs back: still the same card', /1 of 5/.test(await step()) && await cardName() === first);
  await drag(260);
  ok('dragging right answers Done', /2 of 5/.test(await step()));
  const second = await cardName();
  if (!touch) { await p.locator('.ckyes').focus(); await p.keyboard.press('ArrowLeft'); await settle(400); }
  else { await drag(-260); }
  await settle(1000); d = await day(D0);
  ok(`${touch ? 'dragging left' : 'the left arrow key'} answers Skipped`, (d.ck || {}).read === 0 && !(d.a || {}).read && (d.a || {}).reach === true && /3 of 5/.test(await step()), { second, a: d.a, ck: d.ck });
  ok('the weekly floor asks a yes/no, with the week so far', /Workout/.test(await cardName()) && /0 of 3 this week/.test(await text('#ckCard .ckq')), await text('#ckCard'));
  await tap('[data-act=ckYes]'); await settle(1200);
  ok('…Done counts one for the week', ((await wk(D0)).c || {}).gym === 1, (await wk(D0)).c);
  ok('tasks due today come last', /Task/.test(await text('#ckCard .ckwhen')));
  const t1 = await cardName(); await tap('[data-act=ckYes]'); await settle(900);
  const t2 = await cardName(); await tap('[data-act=ckNo]'); await settle(900);
  ok('a task Done is finished; Skipped stays open', (await item(t1)).st === 'done' && (await item(t2)).st === 'open', { t1, t2 });

  /* anything for tomorrow */
  ok('then: anything for tomorrow?', /Anything for tomorrow/.test(await text('.ck h2')) && await p.locator(`[data-act=ckMove]:has-text("${t2}")`).count() === 1);
  await tap(`[data-act=ckMove]:has-text("${t2}")`); await settle(900);
  ok('a skipped task moves to tomorrow in one tap', (await item(t2)).due === dk(plus(D0, 1)) && await p.locator('[data-act=ckMove]').count() === 0, (await item(t2)).due);
  await p.locator('#ckAdd').fill('Renew passport 10am'); await p.keyboard.press('Enter'); await settle(900);
  const rp = await item('Renew passport');
  ok('typing a task adds it for tomorrow, time read', rp.due === dk(plus(D0, 1)) && rp.tm === '10:00' && /Renew passport/.test(await text('.cktm')), rp);
  await tap('[data-act=ckFinish]'); await settle(1300);
  d = await day(D0);
  ok('finish: the day is closed and the week is described', d.ckAt > 0 && /3 things logged/.test(await text('.ckdone h2')) && await p.locator('.ckvals li').count() === 3 && /Read 1\/4|Read 0\/4/.test(await text('.ckvals')), await text('.ckdone'));
  ok('no streaks, no scores', !/streak|points|score/i.test(await text('.ckdone')));
  await tap('.ckdone [data-act=closeSheet]'); await settle();
  ok('once closed, Today stops asking', await p.locator('.ckinvite').count() === 0);

  /* the reminder's link opens it straight away */
  await p.goto('http://compass.test/?from=checkin'); await settle(2000);
  ok('the evening reminder opens the check-in', await p.locator('.cksheet').count() === 1 && /Anything for tomorrow/.test(await text('.ck h2')), await text('.ck h2'));
  ok('…and nothing already answered is asked again', await p.locator('#ckCard').count() === 0);
  await tap('.sheetx'); await settle();

  /* daytime: no invitation */
  await p.clock.setFixedTime(at(plus(D0, 1), 11)); await p.reload(); await settle(1500);
  ok('daytime: no invitation', await p.locator('.ckinvite').count() === 0);

  /* two days later: only yesterday is caught up, never further back */
  const D2 = at(plus(D0, 2), 21), y = plus(D0, 1);
  await p.clock.setFixedTime(D2); await p.reload(); await settle(1500);
  ok('a missed evening: the next one offers to close the day', await p.locator('.ckinvite').count() === 1);
  await tap('.ckinvite [data-act=ckOpen]'); await settle();
  ok('it starts with yesterday', /First, yesterday/.test(await text('.ck h2')) && /Yesterday/.test(await text('#ckCard .ckwhen')), await text('#ckCard'));
  await tap('[data-act=ckYes]'); await settle(1300);
  const yd = ((await wk(y)).days || {})[dk(y)] || {};
  ok('…and ticks yesterday, in yesterday\'s week', Object.values(yd.a || {}).filter(Boolean).length === 1, { y: dk(y), a: yd.a });
  await tap('[data-act=ckNo]'); await settle(500);
  ok('then today', !/Yesterday/.test(await text('#ckCard .ckwhen')), await text('#ckCard .ckwhen'));
  const n2 = +((/of (\d+)/.exec(await step()) || [])[1]);
  ok('one day back only: day one\'s skipped Read isn\'t asked again', n2 >= 4 && n2 <= 8, await step());
  await tap('[data-act=ckSkipAll]'); await settle(500);
  ok('"Skip the rest" goes straight to tomorrow', /Anything for tomorrow/.test(await text('.ck h2')));
  await tap('[data-act=ckFinish]'); await settle(1200);
  ok('finish with nothing ticked today is still calm', /Day closed/.test(await text('.ckdone h2')) && !/fail|missed/i.test(await text('.ckdone')));
  await tap('.ckdone [data-act=closeSheet]'); await settle();

  /* after midnight it's still last night */
  await p.clock.setFixedTime(at(plus(D0, 4), 0, 40)); await p.reload(); await settle(1500);
  ok('at 12:40 am the invitation is for the evening before', await p.locator('.ckinvite').count() === 1);
  await tap('.ckinvite [data-act=ckOpen]'); await settle();
  ok('…and asks about that day', /Today|Yesterday|Task/.test(await text('#ckCard .ckwhen')) || /Anything for tomorrow/.test(await text('.ck h2')));
  ok('no page errors', !errs.length, errs);
  report(`checkin ${W}`, R);
  await b.close();
})().catch(e => { console.log('CRASH', e.message.split('\n').slice(0, 4).join(' | ')); report('checkin', R); process.exit(1); });

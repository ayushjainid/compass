// A task that keeps moving, 12-week goals (set, steps, the Sunday question, done/stop), and planning tomorrow
// (deep link, picking, times, the evening card).
const { chromium } = require('./engine');
const { newCtx, newPage, onboard, report, launch, W, dark, touch } = require('./harness');
const R = []; const ok = (n, c, i) => R.push({ n, pass: !!c, i: c ? undefined : i });
const pad = n => String(n).padStart(2, '0'), dk = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mon = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
(async () => { const b = await launch(chromium);
  const ctx = await newCtx(b), A = await newPage(ctx), { p, tap, store, text } = A;
  const settle = (ms = 500) => p.waitForTimeout(ms);
  const items = async () => Object.entries(await store()).filter(([k]) => /^lists\/[^/]+\/items\//.test(k)).map(([k, v]) => Object.assign({ id: k.split('/').pop(), lid: k.split('/')[1] }, v));
  const item = async t => (await items()).find(i => i.t === t);
  const settings = async () => (await store())['users/u1/docs/settings'] || {};
  const patchItem = async (t, patch) => { const it = await item(t); await p.evaluate(([k, patch]) => { const st = JSON.parse(localStorage.getItem('__mockstore')); Object.assign(st[k], patch); localStorage.setItem('__mockstore', JSON.stringify(st)); }, [`lists/${it.lid}/items/${it.id}`, patch]); await p.reload(); await settle(1500); await tap('[data-act=tab][data-t=tasks]'); await settle(600); };
  const today = dk(new Date()), tomorrow = dk(new Date(Date.now() + 864e5)), thisWk = 'w-' + dk(mon(new Date()));
  await onboard(A, ['rel', 'body', 'learn']);
  await tap('[data-act=tab][data-t=tasks]'); await settle(1200);
  for (const t of ['Renew passport today', 'Call the bank', 'Fix the bike']) { await p.locator('#qAdd').fill(t); await p.keyboard.press('Enter'); await settle(350); }

  /* ---- a task that keeps moving ---- */
  ok('no nudge for a task that hasn\'t moved', await p.locator('.slipcard').count() === 0);
  await patchItem('Renew passport', { moves: 3 });
  await tap('[data-act=tv][data-v=today]');
  ok('after three moves: one gentle question, with ways out', await p.locator('.slipcard').count() === 1 && /“Renew passport” has moved 3 times/.test(await text('.slipcard')) && await p.locator('.slipcard [data-act=slipBreak]').count() === 1 && await p.locator('.slipcard [data-act=iLet]').count() === 1, await text('.slipcard'));
  await tap('.lrow:has-text("Renew passport") [data-act=iOpen]');
  ok('the open task says it too', /Moved 3 times/.test(await text('.sheet .islip')));
  await tap('.sheet [data-act=closeSheet] >> nth=0');
  await tap('.slipcard [data-act=slipKeep]'); await settle();
  ok('"Keep it as is": asked once, not again', await p.locator('.slipcard').count() === 0 && (await item('Renew passport')).nz === 3);
  await patchItem('Renew passport', { moves: 6 });
  await tap('[data-act=tv][data-v=today]');
  ok('…unless it moves three more times', await p.locator('.slipcard').count() === 1 && /moved 6 times/.test(await text('.slipcard')));
  await tap('.slipcard [data-act=slipBreak]'); await settle(300);
  ok('"Break off a first step" opens the task with the step box ready', await p.locator('.sheet #iMore.open #iSubIn').count() === 1 && await p.evaluate(() => document.activeElement && document.activeElement.id) === 'iSubIn' && (await item('Renew passport')).nz === 6);
  await p.locator('#iSubIn').fill('Find the old passport'); await p.keyboard.press('Enter'); await settle();
  ok('…and the first step is saved', ((await item('Renew passport')).sub || []).some(x => x.t === 'Find the old passport'));
  await tap('.sheet [data-act=closeSheet] >> nth=0');

  /* ---- 12-week goals ---- */
  await tap('[data-act=tab][data-t=compass]'); await tap('[data-act=cSec][data-k=season]');
  ok('Compass → Season invites a 12-week goal', /12-week goals/.test(await text('#csec-season')) && await p.locator('#csec-season [data-act=gNew]').count() === 1);
  await tap('#csec-season [data-act=gNew]');
  await tap('.sheet [data-act=gSave]');
  ok('a goal needs a name', await p.locator('.sheet #gTitle').count() === 1 && !(await settings()).goals);
  await p.locator('#gTitle').fill('Run 10 km without stopping'); await tap('.sheet [data-act=gVal][data-v=body]'); await p.locator('#gWhen').fill('I finish the Sunday 10 km loop');
  ok('the form keeps what you typed while you pick', await p.locator('#gTitle').inputValue() === 'Run 10 km without stopping' && await p.locator('.sheet [data-act=gVal][data-v=body].sel').count() === 1);
  await tap('.sheet [data-act=gSave]'); await settle();
  let g = ((await settings()).goals || [])[0];
  ok('saved: this week to 12 weeks on, serving a value', g && g.t === 'Run 10 km without stopping' && g.v === 'body' && g.start === dk(mon(new Date())) && g.st === 'on' && g.when === 'I finish the Sunday 10 km loop', g);
  ok('the goal opens: week 1 of 12, twelve marks, asks for a next step', /Week 1 of 12/.test(await text('.sheet')) && await p.locator('.sheet .gtrack.big i').count() === 12 && await p.locator('.sheet #gStepIn').count() === 1 && /Done when I finish the Sunday 10 km loop/.test(await text('.sheet .gwhen')));
  await p.locator('#gStepIn').fill('Book a 5 km run for Saturday'); await p.keyboard.press('Enter'); await settle();
  const step = await item('Book a 5 km run for Saturday');
  ok('a next step lands in the Inbox, linked to the goal and its value', step && step.lid === 'in-u1' && step.g === g.id && step.v === 'body', step);
  ok('…and shows under Next steps', /Book a 5 km run for Saturday/.test(await text('.sheet')));
  await tap('.sheet [data-act=gWeek][data-v="2"]'); await settle(1200);
  g = (await settings()).goals[0];
  ok('"Did this week move it?" Yes: this week is marked', g.wk && g.wk[thisWk] === 2 && await p.locator('.sheet .gtrack i.y').count() === 1, g.wk);
  await tap('.sheet [data-act=closeSheet] >> nth=0');
  ok('Compass shows the goal with its weeks', /Run 10 km without stopping/.test(await text('#csec-season .goal')) && /Week 1 of 12/.test(await text('#csec-season .goal')) && /1 next step/.test(await text('#csec-season .goal')));
  await tap('[data-act=tab][data-t=tasks]'); await tap('[data-act=tv][data-v=today]');
  ok('Tasks → Today keeps the goal in sight', await p.locator('.gstrip .gchip').count() === 1 && /wk 1\/12/.test(await text('.gstrip')));
  await tap('[data-act=tv][data-v=inbox]');
  ok('a step shows which goal it moves', /◎ Run 10 km/.test(await text('.lrow:has-text("Book a 5 km run")')));
  await tap('.lrow:has-text("Fix the bike") [data-act=iOpen]');
  await tap('.sheet #iMore .imoresum');
  ok('any task can be tied to a goal', await p.locator('.sheet [data-act=iGoal]').count() === 2);
  await tap('.sheet [data-act=iGoal]:has-text("Run 10 km")'); await settle(300);
  ok('…and is', (await item('Fix the bike')).g === g.id);
  await tap('.sheet [data-act=closeSheet] >> nth=0');
  // the Sunday review asks about it, numbered in order
  await tap('[data-act=tab][data-t=review]'); await settle();
  const heads = await p.locator('#main h3').allInnerTexts();
  ok('the review asks whether the week moved each goal, as step 2', heads.some(h => /^2 · Did this week move your goals\?/i.test(h)) && heads.some(h => /^1 · Floors/i.test(h)) && heads.some(h => /^3 · Am I at peace/i.test(h)), heads.slice(0, 6));
  await tap('.grev [data-act=gWeek][data-v="1"]'); await settle(1200);
  ok('answering there updates the same week', (await settings()).goals[0].wk[thisWk] === 1);
  // three is the most
  await tap('[data-act=tab][data-t=compass]');
  for (const t of ['Ship the portfolio site', 'Read four books']) { await tap('#csec-season [data-act=gNew]'); await p.locator('#gTitle').fill(t); await tap('.sheet [data-act=gSave]'); await settle(300); await tap('.sheet [data-act=closeSheet] >> nth=0'); } await settle(1000);
  ok('three goals at most: no fourth', (await settings()).goals.length === 3 && await p.locator('#csec-season [data-act=gNew]').count() === 0);
  await tap('#csec-season .goal:has-text("Read four books")'); await tap('.sheet [data-act=gStop]'); await settle(1200);
  ok('stopping a goal keeps it as an earlier one, and frees a place', (await settings()).goals.find(x => x.t === 'Read four books').st === 'stopped' && /1 earlier goal/i.test(await text('#csec-season')) && await p.locator('#csec-season [data-act=gNew]').count() === 1, [(await settings()).goals.map(x => x.st), await text('#csec-season')]);
  await tap('#csec-season .goal:has-text("Ship the portfolio")'); await tap('.sheet [data-act=gDone]'); await settle(1200);
  ok('marking one done', (await settings()).goals.find(x => x.t === 'Ship the portfolio site').st === 'done' && /2 earlier goals/i.test(await text('#csec-season')), [(await settings()).goals.map(x => x.st), await text('#csec-season')]);
  await tap('#csec-season .goal:has-text("Run 10 km")'); await tap('.sheet [data-act=gEdit]'); await p.locator('#gTitle').fill('Run 10 km, no walking'); await tap('.sheet [data-act=gSave]'); await settle(1200);
  ok('editing keeps the weeks', (await settings()).goals[0].t === 'Run 10 km, no walking' && (await settings()).goals[0].wk[thisWk] === 1);
  await tap('.sheet [data-act=closeSheet] >> nth=0');

  /* ---- plan tomorrow ---- */
  await p.goto('http://compass.test/?plan=tomorrow'); await settle(1800);
  const tw = new Date(Date.now() + 864e5).toLocaleDateString('en-US', { weekday: 'long' });
  ok('a link straight to planning tomorrow (from a reminder) opens it', await p.locator('.sheet .plan').count() === 1 && new RegExp(tw).test(await text('.sheet h2')), await text('.sheet h2'));
  ok('…offering today\'s leftovers, goal steps and the Inbox', /Left from today/i.test(await text('.sheet')) && /Steps toward your goals/i.test(await text('.sheet')) && /Renew passport/.test(await text('.sheet')), await text('.sheet'));
  await tap('.sheet .plrow:has-text("Book a 5 km run") [data-act=ptPick]'); await settle(300);
  ok('tapping one puts it on tomorrow', (await item('Book a 5 km run for Saturday')).due === tomorrow && await p.locator('.sheet .plrow.on').count() >= 1);
  await p.locator('.sheet .plrow.on:has-text("Book a 5 km run") select').selectOption('07:30'); await settle(300);
  ok('…with a time', (await item('Book a 5 km run for Saturday')).tm === '07:30' && /1 task, 1 with a time/.test(await text('.sheet .plfoot')), await text('.sheet .plfoot'));
  await tap('.sheet .plrow:has-text("Renew passport") [data-act=ptPick]'); await settle(300);
  const rp = await item('Renew passport');
  ok('moving today\'s task to tomorrow counts as a move', rp.due === tomorrow && rp.moves === 7, rp);
  await tap('.sheet .plrow:has-text("Renew passport") [data-act=ptPick]'); await settle(300);
  const rp2 = await item('Renew passport');
  ok('changing your mind puts it back as it was', rp2.due === today && rp2.moves === 6, rp2);
  await tap('.sheet [data-act=ptDone]'); await settle();
  ok('done: noted for tomorrow, and the sheet closes', (await settings()).plannedFor === tomorrow && await p.locator('.sheet').count() === 0);
  await tap('[data-act=tab][data-t=tasks]'); await tap('[data-act=tv][data-v=upcoming]');
  ok('tomorrow\'s plan shows in Upcoming with its time', /Book a 5 km run/.test(await text('.uday:nth-of-type(2), .uday >> nth=1')) || /7:30 am/.test(await text('#lview')));
  ok('no page errors', A.errs.length === 0, A.errs);

  /* ---- the evening card (a separate person, at 6:30 pm) ---- */
  const ctx2 = await newCtx(b), E = await newPage(ctx2, { user: { uid: 'u7', displayName: 'Eve Night', email: 'e@x.test' } });
  const eve = new Date(); eve.setHours(18, 30, 0, 0);
  await E.p.clock.setFixedTime(eve);
  await onboard(E);
  await E.tap('[data-act=tab][data-t=tasks]'); await E.p.waitForTimeout(1200);
  ok('after 4 pm: "Plan tomorrow" on Tasks → Today', await E.p.locator('#lview .plancard').count() === 1);
  /* one invitation at a time: with the plan card showing, a slipping task waits */
  await E.p.locator('#qAdd').fill('Call mum today'); await E.p.keyboard.press('Enter'); await E.p.waitForTimeout(300);
  await E.p.evaluate(() => { const st = window.__store; for (const k of Object.keys(st)) if (st[k] && st[k].t === 'Call mum') st[k].moves = 3; localStorage.setItem('__mockstore', JSON.stringify(st)); });
  await E.p.reload(); await E.p.waitForTimeout(1500); await E.tap('[data-act=tab][data-t=tasks]'); await E.tap('[data-act=tv][data-v=today]');
  ok('one invitation at a time: Plan tomorrow shows, the slipping question waits', await E.p.locator('#lview .plancard').count() === 1 && await E.p.locator('#lview .slipcard').count() === 0);
  ok('the list comes first, then the invitation', await E.p.evaluate(() => { const r = document.querySelector('#lview .lrow'), c = document.querySelector('#lview .plancard'); return !!r && !!c && r.getBoundingClientRect().top < c.getBoundingClientRect().top; }));
  ok('today\'s values in one line, and a value dot on the task', /Today serves\s*Deep relationships/.test(await E.text('#lview .serves')) && await E.p.locator('.lrow:has-text("Call mum") .tval .vdot').count() === 1, await E.text('#lview .serves'));
  ok('no week switcher and no floating + on Tasks', await E.p.locator('#weeknav').isHidden() && await E.p.locator('#fab').isHidden());
  ok('the tick has a 44px tap area', await E.p.evaluate(() => { const t = document.querySelector('#lview .lrow .tick'), b = getComputedStyle(t, '::before'); return t.offsetWidth + 2 * -parseFloat(b.left) >= 44; }));
  ok('no coloured stripe on rounded cards', await E.p.evaluate(() => ['.focus', '.plancard'].every(sel => { const e = document.querySelector('#lview ' + sel); if (!e) return true; const c = getComputedStyle(e); return parseFloat(c.borderLeftWidth) <= 1 && parseFloat(c.borderTopWidth) <= 1; })));
  await E.tap('[data-act=tab][data-t=today]');
  ok('…and on Today', await E.p.locator('#main .plancard').count() === 1);
  await E.tap('[data-act=tab][data-t=tasks]'); await E.tap('#lview [data-act=ptHide]');
  ok('with the plan card dismissed, the slipping question can show', await E.p.locator('#lview .slipcard').count() === 1);
  await E.tap('[data-act=tab][data-t=today]');
  ok('"Not tonight" hides it everywhere', await E.p.locator('.plancard').count() === 0);
  ok('no page errors (evening)', E.errs.length === 0, E.errs);
  report(`more ${W}${dark ? 'd' : ''}`, R);
  await b.close();
})().catch(e => { console.log('CRASH', e.message.split('\n').slice(0, 4).join(' | ')); report('more', R); process.exit(1); });

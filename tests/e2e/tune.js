// Long notes keep their words in quick add; floors that count unless you say otherwise; the two-week floor
// tune-up; and the welcome back after a week away.
const { chromium } = require('./engine');
const { newCtx, newPage, report, launch, W } = require('./harness');
const R = []; const ok = (n, c, i) => R.push({ n, pass: !!c, i: c ? undefined : i });
const pad = n => String(n).padStart(2, '0'), dk = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mon = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const plus = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
(async () => { const b = await launch(chromium);
  const ctx = await newCtx(b), A = await newPage(ctx), { p, tap, store, text, errs } = A;
  const settle = (ms = 400) => p.waitForTimeout(ms);
  /* a Thursday, late morning, so this week has days before and after today */
  const now = plus(mon(new Date()), 3); now.setHours(11, 0, 0, 0); const today = dk(now);
  await p.clock.setFixedTime(now);
  await p.goto('http://compass.test/'); await settle(500);
  await tap('.lhero [data-act=signin]'); await settle(600);
  await tap('[data-act=obNext]'); for (const v of ['rel', 'body', 'learn']) await tap(`[data-act=obValue][data-v=${v}]`);
  while (await p.locator('[data-act=obNext]').count()) await tap('[data-act=obNext]');
  await settle(600); await tap('[data-act=introDone]').catch(() => {});
  const patch = async (k, src) => { await p.evaluate(([k, src]) => { const st = JSON.parse(localStorage.getItem('__mockstore')); st[k] = (0, eval)('(' + src + ')')(st[k] || {}); localStorage.setItem('__mockstore', JSON.stringify(st)); }, [k, src]); };
  const prof = async () => (await store())['users/u1/docs/profile'];

  /* ---- quick add keeps a long note as typed ---- */
  await tap('[data-act=tab][data-t=tasks]'); await settle(500); await tap('[data-act=tv][data-v=inbox]'); await settle(300);
  const note = "Talk to papa about Air India options: 7:45 AM Indore, or 8:20 AM Udaipur TUE. Jiju's flight on 7:00 AM WED";
  await p.locator('#qAdd').fill(note); await settle(200);
  ok('a long note with times in it shows no date chips', await p.locator('#qChips .qchip.due, #qChips .qchip.time').count() === 0);
  await p.keyboard.press('Enter'); await settle(1200);
  const it = Object.values(await store()).find(v => v && typeof v.t === 'string' && v.t.startsWith('Talk to papa'));
  ok('…and is saved word for word, with no date', it && it.t === note && !it.due && !it.tm, it);
  await p.locator('#qAdd').fill('call mum fri 6pm'); await settle(200);
  ok('short tasks are still read: "call mum fri 6pm"', await p.locator('#qChips .qchip.time').count() === 1 && await p.locator('#qChips .qchip.due').count() === 1);
  await p.locator('#qAdd').fill(''); await settle(1200);

  /* ---- counts unless I say otherwise ---- */
  await tap('[data-act=tab][data-t=compass]'); await tap('[data-act=cSec][data-k=values]');
  await tap('[data-act=editComp][data-id=read]'); await settle(300);
  ok('a daily floor offers "Counts unless I say otherwise"', await p.locator('.sheet [data-act=cToggle][data-f=dflt]').count() === 1);
  await tap('.sheet [data-act=cToggle][data-f=dflt]'); await tap('.sheet [data-act=saveComp]'); await settle(1300);
  let pr = await prof(); const read = pr.components.find(c => c.id === 'read');
  ok('…saved with the day it starts', read.dflt === true && read.dfltFrom === today, { dflt: read.dflt, from: read.dfltFrom });
  await tap('[data-act=tab][data-t=today]'); await settle(400);
  ok('Today: it is already ticked (in the done fold)', /Read/.test(await text('.donehead')), await text('.donehead'));
  await tap('[data-act=doneFold]'); await settle(300);
  ok('…and says why', await p.locator('.dayrow[data-k=read][aria-pressed=true]').count() === 1 && /Counts by default/.test(await text('.dayrow[data-k=read]')), await text('.dayrow[data-k=read]'));
  ok('…and earlier days this week are not rewritten', /1/.test(await text('.dayrow[data-k=read] .tail')), await text('.dayrow[data-k=read] .tail'));
  await tap('.dayrow[data-k=read]'); await settle(1300);
  const wkd = (await store())['users/u1/docs/w-' + dk(mon(now))] || {};
  ok('untick on a day it didn\'t happen: saved as a miss', ((wkd.days || {})[today] || {}).a.read === false && await p.locator('.dayrow[data-k=read][aria-pressed=false]').count() === 1, (wkd.days || {})[today]);
  await tap('.dayrow[data-k=read][aria-pressed=false]'); await settle(1000);
  p.clock.setFixedTime(new Date(now.getTime() + 9 * 3600e3)); await p.reload(); await settle(1500);
  await tap('.ckinvite [data-act=ckOpen]'); await settle(400);
  const names = []; for (let i = 0; i < 10 && await p.locator('#ckCard').count(); i++) { names.push(await text('#ckCard .cknm')); await tap('[data-act=ckNo]'); await settle(250); }
  ok('the evening check-in doesn\'t ask about it', names.length > 0 && !names.includes('Read'), names);
  await tap('.sheetx').catch(() => {}); await settle(300);

  /* ---- two weeks in: the tune-up ---- */
  const m0 = mon(now), w1 = 'w-' + dk(plus(m0, -7)), w2 = 'w-' + dk(plus(m0, -14));
  const days = (m, ticks) => { const o = {}; ticks.forEach(i => { o[dk(plus(m, i))] = { a: { reach: true }, j: {} }; }); return o; };
  await patch('users/u1/docs/profile', `p => { p.onboardedAt = "${dk(plus(m0, -15))}"; return p; }`);
  await patch('users/u1/docs/' + w1, `w => ({ kind: "week", start: "${dk(plus(m0, -7))}", days: ${JSON.stringify(days(plus(m0, -7), [0, 2]))}, c: { gym: 3 }, r: {} })`);
  await patch('users/u1/docs/' + w2, `w => ({ kind: "week", start: "${dk(plus(m0, -14))}", days: ${JSON.stringify(days(plus(m0, -14), [1]))}, c: { gym: 3 }, r: {} })`);
  await p.clock.setFixedTime(now); await p.reload(); await settle(1500);
  await tap('[data-act=tab][data-t=review]'); await settle(1500);
  ok('two weeks in, Review offers a tune-up', await p.locator('.tunecard').count() === 1, await text('#main'));
  await tap('.tunecard'); await settle(500);
  ok('each floor beside what really happened, hardest first', /3 of 10 days over 2 weeks/.test(await text('.tunerow:has-text("Reach out")')) && /6 of 6 times/.test(await text('.tunerow:has-text("Workout")')) && /Read/.test(await text('.tunerow >> nth=0')), await text('.tunelist'));
  ok('a floor that held has nothing to lower', await p.locator('.tunerow:has-text("Workout") [data-act=tuneLower]').count() === 0);
  await tap('.tunerow:has-text("Reach out") [data-act=tuneLower]'); await settle(1300);
  pr = await prof();
  ok('Lower sets it to what you really did', pr.components.find(c => c.id === 'reach').target === 2 && /Lowered to 2/.test(await text('.tunerow:has-text("Reach out")')), pr.components.find(c => c.id === 'reach').target);
  const pauseRow = p.locator('.tunerow:has([data-act=tunePause])').first(); const pausedName = (await pauseRow.locator('b').innerText()).trim();
  await tap(pauseRow.locator('[data-act=tunePause]')); await settle(1200);
  pr = await prof();
  ok('Pause pauses it from this week', pr.components.find(c => c.name === pausedName).paused === dk(m0), pausedName);
  await tap('[data-act=tuneFinish]'); await settle(1200);
  ok('Done: the card goes away for about two months', (await store())['users/u1/docs/settings'].tuneAt === today && await p.locator('.tunecard').count() === 0);

  /* ---- a week away ---- */
  await patch('users/u1/docs/settings', `s => { s.seen = Object.assign({}, s.seen, { d: "${dk(plus(now, -9))}" }); delete s.wb; return s; }`);
  await p.reload(); await settle(1500);
  ok('after a week away: welcome back, not a wall of misses', /Welcome back/.test(await text('.wback')) && /Nothing to catch up on/.test(await text('.wback')), await text('#main'));
  await tap('.wback [data-act=wbLight]'); await settle(1300);
  const wk = (await store())['users/u1/docs/w-' + dk(m0)] || {};
  ok('"Start lighter" makes this a Minimum Viable Week', wk.mvw === true && await p.locator('.wback').count() === 0);
  await p.reload(); await settle(1500);
  ok('…and it doesn\'t come back the same day', await p.locator('.wback').count() === 0);
  ok('no page errors', !errs.length, errs);
  report(`tune ${W}`, R);
  await b.close();
})().catch(e => { console.log('CRASH', e.message.split('\n').slice(0, 4).join(' | ')); report('tune', R); process.exit(1); });

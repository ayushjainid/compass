// Say or type the day at once in the check-in; the smaller version of a floor still counts; and what your own
// weeks show in Review.
const { chromium } = require('./engine');
const { newCtx, newPage, report, launch, W } = require('./harness');
const R = []; const ok = (n, c, i) => R.push({ n, pass: !!c, i: c ? undefined : i });
const pad = n => String(n).padStart(2, '0'), dk = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mon = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const plus = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
(async () => { const b = await launch(chromium);
  const ctx = await newCtx(b), A = await newPage(ctx), { p, tap, store, text, errs } = A;
  const settle = (ms = 400) => p.waitForTimeout(ms);
  const now = plus(mon(new Date()), 2); now.setHours(21, 0, 0, 0); const today = dk(now);
  await p.clock.setFixedTime(now);
  await p.goto('http://compass.test/'); await settle(500);
  await tap('.lhero [data-act=signin]'); await settle(600);
  await tap('[data-act=obNext]'); for (const v of ['rel', 'body', 'learn']) await tap(`[data-act=obValue][data-v=${v}]`);
  while (await p.locator('[data-act=obNext]').count()) await tap('[data-act=obNext]');
  await settle(600); await tap('[data-act=introDone]').catch(() => {});
  const patch = async (k, src) => { await p.evaluate(([k, src]) => { const st = JSON.parse(localStorage.getItem('__mockstore')); st[k] = (0, eval)('(' + src + ')')(st[k] || {}); localStorage.setItem('__mockstore', JSON.stringify(st)); }, [k, src]); };
  const day = async () => (((await store())['users/u1/docs/w-' + dk(mon(now))] || {}).days || {})[today] || {};

  /* a smaller version for "Reach out" */
  await tap('[data-act=tab][data-t=compass]'); await tap('[data-act=cSec][data-k=values]');
  await tap('[data-act=editComp][data-id=reach]'); await settle(300);
  await p.locator('#c-swap').fill('a 2-minute voice note'); await settle(200);
  await tap('.sheet [data-act=saveComp]'); await settle(1300);
  ok('a floor keeps its smaller version', ((await store())['users/u1/docs/profile'].components.find(c => c.id === 'reach') || {}).swap === 'a 2-minute voice note');

  await tap('[data-act=tab][data-t=today]'); await settle(400);
  await tap('.ckinvite [data-act=ckOpen]'); await settle(400);
  ok('the check-in offers "say or type it all at once"', await p.locator('[data-act=ckSay]').count() === 1);
  ok('…and the card offers the smaller version', /2-minute voice note/.test(await text('[data-act=ckSwap]')), await text('#ckCard .cknm'));
  await tap('[data-act=ckSwap]'); await settle(1200);
  let d = await day();
  ok('the smaller version counts as done, and is remembered as a swap', (d.a || {}).reach === true && (d.sw || {}).reach === 1, d);
  await tap('[data-act=ckSay]'); await settle(300);
  await p.locator('#ckSayIn').fill('no workout today, but I read on the train'); await settle(900);
  const hits = await p.locator('.ckhits .chip').allInnerTexts();
  ok('a line is matched to the cards, with "no …" read as skipped', hits.some(h => /✓\s*Read/.test(h)) && hits.some(h => /✗\s*Workout/.test(h)), hits);
  await tap('.ckhits .chip:has-text("Workout")'); await settle(300);
  ok('tap a match to switch it', /✓\s*Workout/.test(await text('.ckhits .chip:has-text("Workout")')));
  await tap('.ckhits .chip:has-text("Workout")'); await settle(300);
  await tap('[data-act=ckSayGo]'); await settle(1300);
  d = await day(); const wk = (await store())['users/u1/docs/w-' + dk(mon(now))] || {};
  ok('Apply answers them all: Read done, Workout skipped', (d.a || {}).read === true && (d.ck || {}).gym === 0 && !(wk.c || {}).gym, { a: d.a, ck: d.ck, c: wk.c });
  ok('…and the check-in carries on (or goes to tomorrow) from there', await p.locator('#ckCard').count() === 0 ? /Anything for tomorrow/.test(await text('.ck h2')) : true);
  await tap('.sheetx').catch(() => {}); await settle(300);

  /* ---- ten reviewed weeks: what they show ---- */
  const m0 = mon(now);
  for (let i = 1; i <= 10; i++) {
    const m = plus(m0, -7 * i), held = i % 2 === 0, days = {};
    for (let j = 0; j < 7; j++) days[dk(plus(m, j))] = { a: { reach: held || j < 1, read: j < 4 }, j: {} };
    await patch('users/u1/docs/w-' + dk(m), `w => ({ kind: "week", start: "${dk(m)}", days: ${JSON.stringify(days)}, c: { gym: 3 }, r: { felt: ${held ? 5 : 2} } })`);
  }
  await patch('users/u1/docs/profile', `p => { p.onboardedAt = "${dk(plus(m0, -80))}"; p.components.forEach(c => { if (c.id === "reach") c.target = 5; }); return p; }`);
  await p.reload(); await settle(1500);
  await tap('[data-act=tab][data-t=review]'); await settle(1800);
  const ins = await text('.insight');
  ok('Review: what your own weeks show', /Weeks when Deep relationships held, you rated the week Good or better 5 of 5 times\. When it slipped: 0 of 5/.test(ins), ins);
  ok('…said as a pattern, not a cause', /A pattern, not proof of cause/.test(ins));
  ok('no page errors', !errs.length, errs);
  report(`say ${W}`, R);
  await b.close();
})().catch(e => { console.log('CRASH', e.message.split('\n').slice(0, 4).join(' | ')); report('say', R); process.exit(1); });

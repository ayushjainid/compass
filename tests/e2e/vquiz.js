// Values discovery: ten questions on the values step (and later from Compass), scoring, applying picks and stars
const { chromium } = require('./engine');
const { newCtx, newPage, report, launch, W, dark, S } = require('./harness');
const R = []; const ok = (n, c, i) => R.push({ n, pass: !!c, i: c ? undefined : i });
// [value, how much like me 1–5, lived lately 1–3] in question order
const ANSWERS = { rel: [5, 1], solve: [4, 3], body: [5, 2], mind: [3, 2], learn: [4, 3], create: [2, 1], serve: [3, 1], money: [4, 3], world: [1, 2], time: [5, 1] };
(async () => { const b = await launch(chromium);
  const ctx = await newCtx(b), pg = await newPage(ctx), { p, errs, tap, store, text } = pg;
  await p.goto('http://compass.test/'); await p.waitForTimeout(500); await tap('.lhero [data-act=signin]'); await p.waitForTimeout(600);
  await tap('[data-act=obNext]');
  ok('values step offers the questions as optional', /Not sure\? Answer 10 quick questions/.test(await text('.vqcta')));
  await tap('[data-act=vqStart]');
  ok('opens on question 1 of 10 with five answers and three for "lately"', /Question 1 of 10/i.test(await text('.sheet')) && await p.locator('.sheet .vqopt').count() === 5 && await p.locator('.sheet .vqlive button').count() === 3);
  await p.screenshot({ path: `${S}/vquiz-q-${W}${dark ? 'd' : ''}.png` });
  ok('Next waits for an answer', await p.locator('.sheet [data-act=vqNext]').isDisabled());
  // answer every question; check Back keeps answers on the way
  const order = await p.evaluate(() => [...document.querySelectorAll('.vqq')].map(x => x.textContent));
  for (let i = 0; i < 10; i++) {
    const q = await text('.sheet .vqq');
    const v = { 'Real time': 'rel', 'I feel most': 'solve', 'Feeling strong': 'body', 'A calm': 'mind', "I'm always": 'learn', 'I need to make': 'create', 'It matters to me': 'serve', 'A financial': 'money', 'I seek out': 'world', 'Unplanned': 'time' };
    const key = Object.keys(v).find(k => q.startsWith(k)); const [a, l] = ANSWERS[v[key]];
    await tap(`.sheet .vqopt[data-v="${a}"]`); await tap(`.sheet .vqlive button[data-v="${l}"]`); await p.waitForTimeout(350);
    if (i === 2) { await tap('.sheet [data-act=vqBack]'); ok('Back shows the previous answer still chosen', await p.locator('.sheet .vqopt[aria-checked=true]').count() === 1 && /Question 3 of 10/i.test(await text('.sheet'))); await tap('.sheet [data-act=vqNext]'); }
  }
  const res = await text('.sheet');
  ok('results: every value ranked', await p.locator('.sheet .vqrow').count() === 10, res.slice(0, 300));
  const picked = await p.$$eval('.sheet .vqrow.pick .vqname > span', xs => xs.map(x => x.textContent.replace('★', '').trim()));
  ok('picks are the ones rated "like me" or more (5 to 7)', picked.length === 6 && ['Deep relationships', 'Physical fitness', 'Time you own', 'Problem solving', 'Learning', 'Financial security'].every(n => picked.includes(n)), picked);
  ok('stars go to what matters most but gets little room lately', (await p.$$eval('.sheet .vqrow .cstar', xs => xs.map(x => x.parentElement.textContent))).every(t => /Deep relationships|Time you own/.test(t)) && await p.locator('.sheet .vqrow .cstar').count() === 2);
  ok('explains the gap and cites the research', /little room lately/.test(res) && /Portrait Values Questionnaire/.test(res) && /Valued Living/.test(res));
  await p.screenshot({ path: `${S}/vquiz-res-${W}${dark ? 'd' : ''}.png`, fullPage: false });
  await tap('.sheet [data-act=vqUse]'); await p.waitForTimeout(300);
  const on = await p.$$eval('[data-act=obValue][aria-pressed=true]', xs => xs.map(x => x.dataset.v));
  const stars = await p.$$eval('.vstar[aria-pressed=true]', xs => xs.map(x => x.dataset.v));
  ok('Use these: the values are picked on the step', on.length === 6 && ['rel', 'body', 'time', 'solve', 'learn', 'money'].every(v => on.includes(v)), on);
  ok('…and starred', stars.sort().join() === 'rel,time', stars);
  ok('the card now says the picks came from the answers', /Your picks below came from your answers/.test(await text('.vqcta')));
  while (await p.locator('[data-act=obNext]').count()) await tap('[data-act=obNext]');
  await p.waitForTimeout(800);
  const st = await store(), prof = st['users/u1/docs/profile'];
  ok('answers saved with the profile (to revisit later)', prof && prof.vq && prof.vq.a.rel === 5 && prof.vq.l.time === 1 && prof.values.includes('time') && prof.cores.map(c => c.value).sort().join() === 'rel,time', prof && prof.vq);
  // later, from Compass: flat answers get a note; using them reopens setup on the values step
  await tap('[data-act=introDone]').catch(() => {});
  await tap('[data-act=tab][data-t=compass]'); await tap('[data-act=cSec][data-k=values]');
  ok('Compass → Values offers the check with when it was last done', /Check your values/.test(await text('#csec-values .vqcta')) && /Last answered/.test(await text('#csec-values .vqcta')));
  await tap('#csec-values [data-act=vqStart]');
  for (let i = 0; i < 10; i++) { await tap('.sheet .vqopt[data-v="4"]'); await tap('.sheet .vqlive button[data-v="2"]'); await p.waitForTimeout(350); }
  ok('all answers the same: says these are only a starting point', /rated everything about the same/.test(await text('.sheet')));
  await tap('.sheet [data-act=vqRedo]');
  ok('Start over goes back to question 1, cleared', /Question 1 of 10/i.test(await text('.sheet')) && await p.locator('.sheet .vqopt[aria-checked=true]').count() === 0);
  for (let i = 0; i < 10; i++) { const q = await text('.sheet .vqq'); const a = /financial|new places/i.test(q) ? 5 : /calm/i.test(q) ? 4 : 2; await tap(`.sheet .vqopt[data-v="${a}"]`); await tap('.sheet .vqlive button[data-v="1"]'); await p.waitForTimeout(350); }
  await tap('.sheet [data-act=vqUse]'); await p.waitForTimeout(300);
  const on2 = await p.$$eval('[data-act=obValue][aria-pressed=true]', xs => xs.map(x => x.dataset.v));
  ok('from Compass: setup reopens on the values step with the new picks', await p.locator('.vgrid').count() === 1 && on2.includes('money') && on2.includes('world') && on2.length === 5, on2);
  ok('no page errors', errs.length === 0, errs);
  report(`vquiz ${W}${dark ? 'd' : ''}`, R);
  await b.close();
})().catch(e => { console.log('CRASH', e.message.split('\n').slice(0, 4).join(' | ')); report('vquiz', R); process.exit(1); });

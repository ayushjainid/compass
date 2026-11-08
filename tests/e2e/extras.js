// Small things that add up: the tour's newer tips, floors that usually happen counting by default from setup,
// a goal's obstacle plan and note to the end, this week last year, restoring vs draining floors, "after I…" cues,
// pick-something-fun, and shortcuts (links, Android icon menu, keys on a computer).
const { chromium } = require('./engine');
const { newCtx, newPage, report, launch, W, touch } = require('./harness');
const R = []; const ok = (n, c, i) => R.push({ n, pass: !!c, i: c ? undefined : i });
const pad = n => String(n).padStart(2, '0'), dk = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mon = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const plus = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
(async () => { const b = await launch(chromium);
  const ctx = await newCtx(b), A = await newPage(ctx), { p, tap, store, text, errs } = A;
  const settle = (ms = 400) => p.waitForTimeout(ms);
  const now = new Date(); now.setHours(11, 0, 0, 0); await p.clock.setFixedTime(now);
  await p.goto('http://compass.test/'); await settle(500);
  await tap('.lhero [data-act=signin]'); await settle(600);
  await tap('[data-act=obNext]'); for (const v of ['rel', 'body', 'mind']) await tap(`[data-act=obValue][data-v=${v}]`);
  for (let i = 0; i < 6 && await p.locator('[data-act=obNext]').count(); i++) {
    if (await p.locator('[data-act=obMore][data-v=mind]').count() && !(await p.locator('[data-act=obComp][data-id=social]').count())) { await tap('[data-act=obMore][data-v=mind]'); await settle(300); }
    if (await p.locator('[data-act=obComp][data-id=social][aria-pressed=false]').count()) await tap('[data-act=obComp][data-id=social]');
    if (await p.locator('[data-act=obDflt][data-id=social]').count()) { ok('setup offers "Counts unless I untick it" on a floor like "Social media under 1 hr"', await p.locator('[data-act=obDflt][data-id=social][aria-pressed=false]').count() === 1); await tap('[data-act=obDflt][data-id=social]'); }
    await tap('[data-act=obNext]');
  }
  await settle(1200); await tap('[data-act=introDone]').catch(() => {});
  const prof = async () => (await store())['users/u1/docs/profile'];
  const patch = async (k, src) => { await settle(1300); await p.evaluate(([k, src]) => { const st = JSON.parse(localStorage.getItem('__mockstore')); st[k] = (0, eval)('(' + src + ')')(st[k] || {}); localStorage.setItem('__mockstore', JSON.stringify(st)); }, [k, src]); };
  const soc = (await prof()).components.find(c => c.id === 'social');
  ok('…and, once chosen, it starts that way', soc && soc.dflt === true && soc.dfltFrom === dk(now), soc);

  /* the tour's day-3 idea is now "Close the day" */
  await patch('users/u1/docs/profile', `p => { p.onboardedAt = "${dk(plus(now, -3))}"; return p; }`);
  await patch('users/u1/docs/settings', `s => { s.tips = { seen: { floors: 1, tasks: 1, three: 1 }, last: "${dk(plus(now, -1))}" }; return s; }`);
  await p.reload(); await settle(1500); await tap('.ntask [data-act=ntLater]').catch(() => {}); await settle(400);
  ok('the first week now teaches Close the day', /Close the day in a minute/.test(await text('.tip')), await text('.tip'));
  await tap('.tip [data-act=tipDone]'); await settle(1200);

  /* a cue and an energy tag on a floor */
  await tap('[data-act=tab][data-t=compass]'); await tap('[data-act=cSec][data-k=values]');
  await tap('[data-act=editComp][data-id=reach]'); await settle(300);
  await p.locator('#c-cue').fill('my morning coffee');
  await tap('.sheet [data-act=cEnergy][data-v=restore]'); await settle(200);
  await tap('.sheet [data-act=saveComp]'); await settle(1300);
  let reach = (await prof()).components.find(c => c.id === 'reach');
  ok('a floor keeps an "after I…" cue and how it leaves you', reach.cue === 'my morning coffee' && reach.energy === 'restore', reach);
  await tap('[data-act=tab][data-t=today]'); await settle(400);
  ok('Today shows the cue with the floor', /After my morning coffee/.test(await text('.dayrow[data-k=reach]')), await text('.dayrow[data-k=reach]'));
  await tap('.dayrow[data-k=reach]'); await settle(1200);
  await tap('[data-act=tab][data-t=review]'); await settle(1000);
  ok('Review: restoring vs draining this week', /1 restoring · 0 draining this week/.test(await text('.energy')), await text('#main').then(t => t.slice(0, 300)));

  /* this week last year */
  const ly = mon(plus(now, -364));
  await patch('users/u1/docs/w-' + dk(ly), `w => ({ kind: "week", start: "${dk(ly)}", days: { "${dk(plus(ly, 2))}": { a: {}, j: { win: "Long walk with Dad by the river" } } }, c: {}, r: { felt: 4 } })`);
  await p.reload(); await settle(1500); await tap('[data-act=tab][data-t=review]'); await settle(1800);
  ok('Review: one of your own lines from this week last year', /This week last year[\s\S]*Long walk with Dad by the river[\s\S]*felt good/i.test(await text('.lastyear')), await text('#main').then(t => t.slice(0, 400)));

  /* a goal with an obstacle plan and a note to the end */
  await tap('[data-act=tab][data-t=compass]'); await tap('[data-act=cSec][data-k=season]'); await tap('#csec-season [data-act=gNew]'); await settle(300);
  await p.locator('#gTitle').fill('Run 10 km');
  await p.locator('#gObst').fill('late meetings'); await p.locator('#gPlan').fill('run at lunch');
  await p.locator('#gLetter').fill('You wanted this for your knees and your head.');
  await tap('.sheet [data-act=gSave]'); await settle(1300);
  const g = ((await store())['users/u1/docs/settings'].goals || [])[0] || {};
  ok('a goal keeps what could get in the way, the plan, and a note to the end', g.obst === 'late meetings' && g.plan === 'run at lunch' && /knees/.test(g.letter), g);
  ok('…and shows the if-then on the goal', /If late meetings, then run at lunch/.test(await text('.sheet')), await text('.sheet'));
  await tap('.sheetx'); await settle(300);
  await patch('users/u1/docs/settings', `s => { s.goals[0].start = "${dk(plus(mon(now), -91))}"; return s; }`);
  await p.reload(); await settle(1500); await tap('[data-act=tab][data-t=tasks]'); await settle(500);
  await tap(`[data-act=gOpen][data-id="${g.id}"]`); await settle(400);
  ok('when the 12 weeks are up, the note is waiting', /A note from you, 12 weeks ago[\s\S]*knees and your head/i.test(await text('.sheet')), await text('.sheet'));
  await tap('.sheetx'); await settle(300);

  /* pick something fun */
  await patch('users/u1/docs/profile', `p => { p.components.push({ id: "f1", fun: true, name: "Game night", cadence: "weekly", target: 0, hours: 0 }, { id: "f2", fun: true, name: "Sketching", cadence: "weekly", target: 0, hours: 0 }); return p; }`);
  await p.reload(); await settle(1500);
  await tap('[data-act=spin]'); await settle(300);
  const first = await text('.spin b');
  ok('"Pick one for me" suggests something from the fun menu', /Game night|Sketching/.test(first), first);
  await tap('.spin [data-act=spin]'); await settle(300);
  ok('"Another" picks a different one', (await text('.spin b')) !== first);
  await tap('.spin [data-act=inc]'); await settle(1200);
  ok('"Doing it" logs it', Object.values(((await store())['users/u1/docs/w-' + dk(mon(now))] || {}).c || {}).some(n => n >= 1));

  /* shortcuts */
  await p.goto('http://compass.test/?do=add'); await settle(1800);
  ok('a "?do=add" link opens Tasks with the add box ready', await p.evaluate(() => document.activeElement && document.activeElement.id === 'qAdd'));
  await p.goto('http://compass.test/?checkin=1'); await settle(2000);
  ok('a "?checkin=1" link opens Close the day', await p.locator('.cksheet').count() === 1);
  await tap('.sheetx'); await settle(300);
  await tap('[data-act=tab][data-t=compass]'); await tap('[data-act=cSec][data-k=app]'); await tap('#csec-app [data-act=scOpen]'); await settle(300);
  ok('Settings → Shortcuts lists links to copy, with how to use them with Siri', await p.locator('.sclist [data-act=scCopy]').count() === 5 && /Siri/.test(await text('.sheet')));
  await tap('.sheetx'); await settle(300);
  const man = await p.evaluate(() => fetch('/manifest.webmanifest').then(r => r.json())).catch(() => ({}));
  ok('the app icon offers shortcuts (Android long-press)', (man.shortcuts || []).some(s => s.url === '/?checkin=1'));
  if (!touch) {
    await p.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
    await p.keyboard.press('2'); await settle(300);
    ok('keys on a computer: 2 opens Week', await p.locator('[data-act=tab][data-t=week][aria-current=page], [data-act=tab][data-t=week].on').count() >= 1 || /Week/.test(await text('h1, .ttl')));
    await p.keyboard.press('?'); await settle(300);
    ok('? lists the keys', /Keys on a computer/i.test(await text('.sheet')), await text('.sheet'));
  }
  ok('no page errors', !errs.length, errs);
  report(`extras ${W}`, R);
  await b.close();
})().catch(e => { console.log('CRASH', e.message.split('\n').slice(0, 4).join(' | ')); report('extras', R); process.exit(1); });

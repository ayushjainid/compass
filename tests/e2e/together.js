// Floors two people keep together: shared through a list they both belong to, ticked by either, counted once a day for
// each of them; the other person adds it to their floors from that list. Plus a life season, the evening reminder that
// follows your habit, the paper week, more floor ideas, and the year to print or share.
const { chromium } = require('./engine');
const { newCtx, newPage, onboard, report, launch, W } = require('./harness');
const R = []; const ok = (n, c, i) => R.push({ n, pass: !!c, i: c ? undefined : i });
const U = (uid, name, email) => ({ uid, displayName: name, email, photoURL: '', providerData: [{ providerId: 'google.com' }], metadata: { lastSignInTime: new Date().toUTCString() } });
const AYUSH = U('u1', 'Ayush Jain', 'a@example.com'), PRIYA = U('u2', 'Priya Shah', 'p@example.com');
const pad = n => String(n).padStart(2, '0'), dk = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mon = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
(async () => { const b = await launch(chromium);
  const ctx = await newCtx(b, { config: 'self.COMPASS_VAPID_PUBLIC="BPtestkey";' });
  const A = await newPage(ctx, { user: AYUSH }), B = await newPage(ctx, { user: PRIYA });
  const now = new Date(); now.setHours(11, 0, 0, 0); await A.p.clock.setFixedTime(now); await B.p.clock.setFixedTime(now);
  const store = () => A.p.evaluate(() => JSON.parse(localStorage.getItem('__mockstore') || '{}'));
  const settle = (pg, ms = 700) => pg.p.waitForTimeout(ms);
  await onboard(A); await onboard(B, ['rel', 'learn']);
  /* a list they share */
  await A.tap('[data-act=tab][data-t=tasks]'); await A.tap('[data-act=lNew]'); await A.p.locator('#nlName').fill('Home'); await A.p.locator('#nlName').press('Enter'); await settle(A);
  let st = await store(); const lid = Object.keys(st).find(k => /^lists\/l-/.test(k) && st[k].name === 'Home').split('/')[1];
  await A.tap('.lhead [data-act=lShare]'); await A.tap('.sheet [data-act=invMake]'); await settle(A);
  const link = await A.p.locator('.sheet .invlink input').inputValue(); await A.tap('.sheet [data-act=closeSheet] >> nth=0');
  await B.p.goto(link); await B.p.waitForTimeout(1500); await B.tap('.sheet [data-act=invYes]'); await settle(B, 900); await settle(A, 900);
  /* Ayush makes "Reach out to someone close" a floor they do together */
  await A.tap('[data-act=tab][data-t=compass]'); await A.tap('[data-act=cSec][data-k=values]'); await A.tap('[data-act=editComp][data-id=reach]'); await settle(A, 300);
  const opts = await A.p.locator('#c-tog option').evaluateAll(o => o.map(x => x.textContent));   /* a <select>'s innerText differs between engines */
  ok('a floor can be done together with the people in a shared list', opts.length === 2 && opts.some(t => /With the people in “Home”/.test(t)), opts);
  await A.p.locator('#c-tog').selectOption(lid); await A.tap('.sheet [data-act=saveComp]'); await settle(A, 1300);
  st = await store();
  const reach = st['users/u1/docs/profile'].components.find(c => c.id === 'reach'), item = reach.tog && st[`lists/${lid}/items/${reach.tog.iid}`];
  ok('…stored in that list, not as a task', item && item.st === 'fl' && item.open === false && item.fl.cad === 'daily', { tog: reach.tog, item });
  await B.tap('[data-act=tab][data-t=tasks]'); await settle(B, 500);
  await B.tap(`[data-act=tv][data-v="${lid}"]`).catch(() => B.tap(`.tpill:has-text("Home")`)); await settle(B, 700);
  ok('Priya sees it in the shared list: "Together this week", with Add to my floors', /Together this week[\s\S]*Reach out/i.test(await B.text('.together')) && await B.p.locator('.together [data-act=togJoin]').count() === 1, await B.text('#main').then(t => t.slice(0, 400)));
  ok('…and it is not shown as a task', !/Reach out/.test(await B.text('.lview .lrow, .tempty').catch(() => '')));
  await B.tap('.together [data-act=togJoin]'); await settle(B, 1300);
  st = await store();
  const pr = st['users/u2/docs/profile'].components.find(c => c.tog && c.tog.iid === reach.tog.iid);
  ok('Add puts it on her floors, linked to the same one', !!pr && pr.cadence === 'daily', pr);
  /* Ayush ticks it: it counts for Priya too, and she sees who */
  await A.tap('[data-act=tab][data-t=today]'); await settle(A, 400);
  await A.tap('.dayrow[data-k=reach]'); await settle(A, 1300);
  st = await store();
  ok('a tick is written to the shared floor', ((st[`lists/${lid}/items/${reach.tog.iid}`].tk || {})[dk(now)] || {}).u1 === 1, st[`lists/${lid}/items/${reach.tog.iid}`].tk);
  await B.tap('[data-act=tab][data-t=today]'); await settle(B, 1200);
  await B.tap('[data-act=doneFold]').catch(() => {}); await settle(B, 300);
  ok('Priya: it counts for her today, and says Ayush ticked it', await B.p.locator(`.dayrow[data-k="${pr.id}"][aria-pressed=true]`).count() === 1 && /Ayush ticked it/.test(await B.text(`.dayrow[data-k="${pr.id}"]`)), await B.text('#main').then(t => t.slice(0, 500)));
  await B.tap('[data-act=tab][data-t=tasks]'); await settle(B, 500);
  ok('the list shows the week together: 1 of 5 days · you', /1 of 5 days this week · Ayush/.test(await B.text('.together')), await B.text('.together'));

  /* ---- a life season ---- */
  await A.tap('[data-act=tab][data-t=compass]'); await A.tap('[data-act=cSec][data-k=season]'); await A.tap('#csec-season [data-act=seasonOpen]'); await settle(A, 300);
  await A.tap('.sheet [data-act=seasonName][data-v=Illness]');
  await A.tap('.sheet [data-act=seasonSave]'); await settle(A, 1300);
  st = await store(); const ss = st['users/u1/docs/settings'].season || {};
  ok('a life season: a name and an end date (two weeks by default)', ss.name === 'Illness' && ss.from === dk(now) && ss.until > dk(now), ss);
  await A.tap('[data-act=tab][data-t=today]'); await settle(A, 400);
  ok('Today says so, with a way to end it', /Illness · lighter weeks until/.test(await A.text('.seasonline')));
  await A.tap('[data-act=tab][data-t=week]'); await settle(A, 500);
  ok('the week is a lighter one: only the safety net counts', /Minimum Viable Week|safety/i.test(await A.text('#main')), await A.text('#main').then(t => t.slice(0, 300)));
  await A.tap('[data-act=tab][data-t=today]'); await A.tap('.seasonline [data-act=seasonEnd]'); await settle(A, 1300);
  ok('End now: back to usual', await A.p.locator('.seasonline').count() === 0);

  /* ---- the evening reminder follows your habit ---- */
  await A.p.evaluate(() => { const st = JSON.parse(localStorage.getItem('__mockstore')); st['users/u1/docs/settings'].ckMins = [610, 620, 600, 615, 605]; st['notify/u1'] = { on: true, tz: 'UTC', eve: '21:00', subs: {} }; localStorage.setItem('__mockstore', JSON.stringify(st)); });
  await A.p.reload(); await settle(A, 1500);
  await A.tap('[data-act=tab][data-t=compass]'); await A.tap('[data-act=cSec][data-k=remind]'); await settle(A, 400);
  ok('Reminders: "Follow my habit", with when you usually close the day', /You usually close the day around 10:10 pm/.test(await A.text('#csec-remind')), await A.text('#csec-remind'));
  await A.tap('#csec-remind [data-act=ntAuto]'); await settle(A, 1300);
  st = await store();
  ok('…turning it on moves the reminder to just before', st['notify/u1'].eveAuto === true && st['notify/u1'].eve === '21:45', st['notify/u1']);

  await A.tap('#csec-remind [data-act=ntMail]'); await settle(A, 1300);
  st = await store();
  ok('Sunday email: on, to the account\'s own address, booked for Sunday', st['notify/u1'].mail === true && st['notify/u1'].mailTo === 'a@example.com' && !!st['notify/u1'].nextMail, st['notify/u1']);
  /* ---- paper, ideas ---- */
  await A.tap('[data-act=tab][data-t=week]'); await settle(A, 1500);
  await A.p.evaluate(() => { window.print = () => { window.__printed = document.getElementById('printArea').innerText; }; });
  await A.p.locator('[data-act=printWeek]').evaluate(e => e.click()); await settle(A, 400);   // the Week page is still settling as history loads
  const printed = await A.p.evaluate(() => window.__printed || '');
  ok('Print this week: floors with a box per day, and the week\'s three', /Week of/.test(printed) && /Reach out/.test(printed) && /This week's three/.test(printed), printed.slice(0, 200));
  await A.tap('[data-act=tab][data-t=compass]'); if (!(await A.p.locator('[data-act=addComp][data-value=rel]').isVisible().catch(() => false))) await A.tap('[data-act=cSec][data-k=values]');
  await A.tap('[data-act=addComp][data-value=rel]'); await settle(A, 300);
  ok('adding a floor offers more small ideas', /Ask someone one real question/.test(await A.text('.sheet')) && /phone-free meal/i.test(await A.text('.sheet')), await A.text('.sheet'));
  await A.tap('.sheetx').catch(() => A.tap('.sheet [data-act=closeSheet] >> nth=0')); await settle(A, 300);
  ok('no page errors', !A.errs.length && !B.errs.length, A.errs.concat(B.errs));
  report(`together ${W}`, R);
  await b.close();
})().catch(e => { console.log('CRASH', e.message.split('\n').slice(0, 4).join(' | ')); report('together', R); process.exit(1); });

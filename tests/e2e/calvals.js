// Your calendar vs your values: a calendar export (.ics) is read on the device for last week, events are put
// under values (guessed, then corrected and remembered), and set against your Cores.
const { chromium } = require('./engine');
const { newCtx, newPage, onboard, report, launch, W } = require('./harness');
const R = []; const ok = (n, c, i) => R.push({ n, pass: !!c, i: c ? undefined : i });
const pad = n => String(n).padStart(2, '0');
const mon = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const plus = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const stamp = (d, h, m = 0) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(h)}${pad(m)}00`;
(async () => { const b = await launch(chromium);
  const ctx = await newCtx(b), A = await newPage(ctx), { p, tap, store, text, errs } = A;
  const settle = (ms = 400) => p.waitForTimeout(ms);
  await onboard(A, ['rel', 'body', 'learn']);
  const lm = plus(mon(new Date()), -7), ev = (s, d, h, mins, extra = '') => `BEGIN:VEVENT\nSUMMARY:${s}\nDTSTART:${stamp(d, h)}\nDTEND:${stamp(d, h + Math.floor(mins / 60), mins % 60)}\n${extra}END:VEVENT`;
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0',
    ev('Gym session', plus(lm, 0), 7, 60), ev('Gym session', plus(lm, 2), 7, 60),
    ev('Team standup', plus(lm, -14), 9, 30, 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR\n'),
    ev('Dinner with family', plus(lm, 5), 19, 120), ev('Read before bed', plus(lm, 3), 22, 30),
    ev('Next week thing', plus(lm, 8), 10, 60), 'END:VCALENDAR'].join('\n');
  await tap('[data-act=tab][data-t=review]'); await settle(800);
  await tap('[data-act=calvOpen]'); await settle(300);
  ok('Review → your calendar vs your values asks for a calendar file, read on this device', /Nothing is uploaded/.test(await text('#main')));
  await p.locator('#calvFile').setInputFiles({ name: 'work.ics', mimeType: 'text/calendar', buffer: Buffer.from(ics) }); await settle(1500);
  const main = await text('#main');
  ok('last week only, repeats counted on their days: 9 events, 7 h', /9 events · 7 h scheduled/.test(main), main.slice(0, 400));
  ok('events are guessed into values (gym → fitness, dinner with family → relationships)', await p.locator('select[data-calk="gym session"]').inputValue() === 'body' && await p.locator('select[data-calk="dinner with family"]').inputValue() === 'rel');
  await p.locator('select[data-calk="team standup"]').selectOption('learn'); await settle(1300);
  ok('a correction is remembered', ((await store())['users/u1/docs/settings'].calTag || {})['team standup'] === 'learn');
  ok('…and moves the hours', /Learning[\s\S]*2 h 30 min/.test(await text('.went')), await text('.went'));
  await tap('[data-act=calvClose]'); await settle(300); await tap('[data-act=calvOpen]'); await settle(300);
  await p.locator('#calvFile').setInputFiles({ name: 'work.ics', mimeType: 'text/calendar', buffer: Buffer.from(ics) }); await settle(1500);
  ok('next time, your choice is already there', await p.locator('select[data-calk="team standup"]').inputValue() === 'learn');
  await tap('[data-act=calvAgain]'); await settle(300);
  await p.locator('#calvFile').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('just some text') }); await settle(1200);
  ok('a file without events says so plainly', /no calendar events/.test(await text('#main')));
  ok('no page errors', !errs.length, errs);
  report(`calvals ${W}`, R);
  await b.close();
})().catch(e => { console.log('CRASH', e.message.split('\n').slice(0, 4).join(' | ')); report('calvals', R); process.exit(1); });

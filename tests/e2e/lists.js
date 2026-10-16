// Tasks as lists: quick add with dates, views (Today, Upcoming, Inbox, lists), this week's three, task sheet,
// repeats, Someday / Let go, sorting the Inbox, moving old tasks over, and the Today tab's slice
const { chromium } = require('./engine');
const { newCtx, newPage, onboard, report, launch, W, dark, S } = require('./harness');
const R = []; const ok = (n, c, i) => R.push({ n, pass: !!c, i: c ? undefined : i });
const dk = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return dk(d); };
(async () => { const b = await launch(chromium);
  const ctx = await newCtx(b), pg = await newPage(ctx), { p, errs, tap, store, text } = pg;
  await onboard(pg);
  const items = async lid => { const st = await store(); return Object.entries(st).filter(([k]) => k.startsWith(`lists/${lid}/items/`)).map(([k, v]) => Object.assign({ id: k.split('/').pop() }, v)); };
  const type = async (sel, t) => { await p.locator(sel).click(); await p.locator(sel).fill(''); await p.keyboard.type(t, { delay: 5 }); };
  await tap('[data-act=tab][data-t=tasks]'); await p.waitForTimeout(600);
  let st = await store();
  ok('an Inbox list is made for you, only you in it', st['lists/in-u1'] && st['lists/in-u1'].kind === 'inbox' && JSON.stringify(st['lists/in-u1'].members) === '["u1"]', st['lists/in-u1']);
  ok('opens on Today: the date, and this week\'s three explained while empty', /This week's three/.test(await text('.focus')) && /Pick up to three/.test(await text('.focus')) && await p.locator('.ldate').count() === 1);
  ok('views: Today, Upcoming, Inbox and + List', await p.locator('.tnav [data-act=tv]').count() === 3 && await p.locator('.tnav [data-act=lNew]').count() === 1);
  // quick add reads the date and time as you type
  await type('#qAdd', 'Buy milk tomorrow 6pm');
  ok('chips show what was understood', /Tomorrow/.test(await text('#qChips')) && /6 pm/.test(await text('#qChips')), await text('#qChips'));
  await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  let it = (await items('in-u1')).find(x => x.t === 'Buy milk');
  ok('Enter adds it to the Inbox with its day and time, words taken out', it && it.due === day(1) && it.tm === '18:00' && it.open === true && it.by === 'u1', it);
  ok('the field clears for the next one', (await p.locator('#qAdd').inputValue()) === '');
  await type('#qAdd', 'Call the dentist');
  ok('on Today, an undated task is for today', /Today/.test(await text('#qChips')));
  await tap('[data-act=capAdd][data-src=qAdd]'); await p.waitForTimeout(300);
  it = (await items('in-u1')).find(x => x.t === 'Call the dentist');
  ok('…and lands on today\'s list', it && it.due === day(0) && /Call the dentist/.test(await text('.lview')), it);
  // keep a word as text: tap the chip
  await type('#qAdd', 'Plan friday dinner');
  await tap('#qChips .qchip.due');
  await p.keyboard.press('Enter').catch(() => {}); await tap('[data-act=capAdd][data-src=qAdd]').catch(() => {}); await p.waitForTimeout(300);
  it = (await items('in-u1')).find(x => /friday dinner/.test(x.t));
  ok('tapping a chip keeps that word in the title', it && it.t === 'Plan friday dinner' && it.due === day(0), it);
  // Upcoming
  await tap('[data-act=tv][data-v=upcoming]');
  ok('Upcoming groups by day: tomorrow shows Buy milk at 6 pm', /Tomorrow[\s\S]*Buy milk[\s\S]*6 pm/.test(await text('.lview')));
  await p.screenshot({ path: `${S}/lists-upcoming-${W}${dark ? 'd' : ''}.png` });
  // a list
  await tap('[data-act=lNew]'); await p.locator('#nlName').fill('Groceries'); await p.locator('#nlName').press('Enter'); await p.waitForTimeout(400);
  st = await store(); const gid = Object.keys(st).find(k => /^lists\/l-/.test(k) && st[k].name === 'Groceries').split('/')[1];
  ok('new list made and opened, owned by you', st['lists/' + gid].owner === 'u1' && /Groceries/.test(await text('.lname')) && await p.locator(`.tnav [data-v="${gid}"].on`).count() === 1);
  await type('#qAdd', 'eggs'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  ok('adding inside a list puts it in that list, without a day', (await items(gid)).some(x => x.t === 'eggs' && !x.due));
  await tap('[data-act=tv][data-v=today]');
  await type('#qAdd', 'bread #groc'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  ok('#name sends it to that list (start of the name is enough)', (await items(gid)).some(x => x.t === 'bread' && x.due === day(0)), await items(gid));
  await type('#qAdd', 'call plumber #home'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  st = await store();
  ok('#a new name makes that list', Object.values(st).some(v => v && v.kind === 'list' && v.name === 'home'));
  // the task sheet
  await tap('.lrow .ltx:has-text("bread")');
  if (!(await p.locator('.sheet #iTitle').count())) { await p.screenshot({ path: `${S}/lists-dbg.png` }); console.log('DBG', (await p.locator('#sheetRoot').innerHTML()).slice(0, 200), (await text('.lview')).slice(0, 300)); }
  ok('tapping a task opens it', await p.locator('.sheet #iTitle').count() === 1, errs);
  await p.locator('#iTitle').fill('Sourdough bread'); await p.locator('#iNote').click(); await p.locator('#iNote').fill('From the corner bakery');
  await p.locator('#iSubIn').fill('Check opening hours'); await p.locator('#iSubIn').press('Enter'); await p.waitForTimeout(300);
  await tap('.sheet [data-act=iFocus]');
  await tap('.sheet [data-act=closeSheet] >> nth=0').catch(() => p.keyboard.press('Escape')); await p.waitForTimeout(500);
  it = (await items(gid)).find(x => /bread/i.test(x.t));
  ok('title, note, a step and this week\'s three are saved', it && it.t === 'Sourdough bread' && it.n === 'From the corner bakery' && it.sub && it.sub[0].t === 'Check opening hours' && /^w-/.test(it.wk), it);
  ok('it fills a slot in this week\'s three', /Sourdough bread/.test(await text('.focus')) && await p.locator('.fslot.empty').count() === 2);
  await p.screenshot({ path: `${S}/lists-today-${W}${dark ? 'd' : ''}.png` });
  // tick, undo, tick
  await tap('.lrow:has-text("Call the dentist") [data-act=iDone]'); await p.waitForTimeout(500);
  it = (await items('in-u1')).find(x => x.t === 'Call the dentist');
  ok('ticking finishes it (kept, not deleted) and counts for the month', it && it.open === false && it.st === 'done' && it.doneBy === 'u1' && it.doneAt > 0 && (st = await store(), (st['users/u1/docs/settings'].months || {})[day(0).slice(0, 7)].td === 1), it);
  ok('Done today folds below', /Done today/.test(await text('.lview')));
  const undo = p.locator('.toast button'); if (await undo.count()) { await undo.click(); await p.waitForTimeout(400); }
  it = (await items('in-u1')).find(x => x.t === 'Call the dentist');
  ok('Undo in the toast brings it back', it && it.open === true && it.st === 'open', it);
  // repeating
  await type('#qAdd', 'Water plants every day'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  await tap('.lrow:has-text("Water plants") [data-act=iDone]'); await p.waitForTimeout(500);
  it = (await items('in-u1')).find(x => x.t === 'Water plants');
  ok('a repeating task moves to its next day and stays open', it && it.open === true && it.rep.u === 'day' && it.due === day(1), it);
  // Someday and Let go
  await tap('[data-act=tv][data-v=inbox]');
  await tap('.lrow .ltx:has-text("Plan friday dinner")'); await tap('.sheet [data-act=iSome][data-v="1"]'); await p.waitForTimeout(300);
  it = (await items('in-u1')).find(x => /friday dinner/.test(x.t));
  ok('Someday parks it (no day), shown folded in the list', it && it.st === 'some' && !it.due && /Someday/.test(await text('.lview')), it);
  await tap('.lrow .ltx:has-text("Buy milk")'); await tap('.sheet [data-act=iLet]'); await p.waitForTimeout(300);
  it = (await items('in-u1')).find(x => x.t === 'Buy milk');
  ok('Let it go closes it as let go (not done)', it && it.open === false && it.st === 'let', it);
  // sorting the Inbox
  await tap('#fab'); await p.locator('#capSheet').fill('Renew passport\nOrganise photos\nReturn library book'); await tap('.sheet [data-act=capAdd]'); await p.waitForTimeout(300);
  await tap('.sheet [data-act=closeSheet] >> nth=-1').catch(() => {}); await p.waitForTimeout(200);
  await tap('[data-act=tab][data-t=tasks]'); await tap('[data-act=tv][data-v=inbox]');
  ok('three undated tasks: the Inbox offers to sort them', /Sort 3/.test(await text('.lview [data-act=sortStart]')), await text('.lview'));
  await tap('.lview [data-act=sortStart]');
  ok('sorting shows one at a time', /Sorting 1 of 3/i.test(await text('.sheet')) && /Renew passport/.test(await text('.sortcard')));
  await tap('.sheet [data-act=sortPick][data-k=today]'); await p.waitForTimeout(350);
  await tap('.sheet [data-act=sortPick][data-k=week]'); await p.waitForTimeout(350);
  await tap('.sheet [data-act=sortPick][data-k=drop]'); await p.waitForTimeout(350);
  ok('sorted: a summary', /Inbox sorted/.test(await text('.sheet')) && /got a day/.test(await text('.sheet')), await text('.sheet'));
  const inb = await items('in-u1');
  ok('each choice did its thing', inb.find(x => x.t === 'Renew passport').due === day(0) && /^w-/.test(inb.find(x => x.t === 'Organise photos').wk) && inb.find(x => x.t === 'Return library book').st === 'let');
  await tap('.sheet [data-act=closeSheet]');
  // overdue
  await p.evaluate(d => { const st = JSON.parse(localStorage.getItem('__mockstore')); st['lists/in-u1/items/old1'] = { t: 'Send invoice', open: true, st: 'open', due: d, by: 'u1', at: 1, ord: 1 }; localStorage.setItem('__mockstore', JSON.stringify(st)); }, day(-2));
  await p.reload(); await p.waitForTimeout(1500); await tap('[data-act=tab][data-t=tasks]'); await tap('[data-act=tv][data-v=today]');
  ok('past its day: "Still open from before"', /Still open from before[\s\S]*Send invoice/.test(await text('.lview')));
  await tap('[data-act=odToday]'); await p.waitForTimeout(300);
  it = (await items('in-u1')).find(x => x.t === 'Send invoice');
  ok('Move to today moves it, and counts the slip', it.due === day(0) && it.moves === 1, it);
  // Today tab carries today's tasks and this week's three
  await tap('[data-act=tab][data-t=today]'); await p.waitForTimeout(300);
  const tt = await text('#main');
  ok('Today tab shows today\'s tasks', /Tasks ·/i.test(tt) && /Send invoice/.test(tt) && /Renew passport/.test(tt), tt.slice(0, 600));
  // old tasks move over once
  await p.evaluate(() => { const st = JSON.parse(localStorage.getItem('__mockstore')); const wk = (() => { const x = new Date(); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return 'w-' + x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); })();
    st['users/u1/docs/tasks'] = { items: [{ id: 'o1', t: 'Old inbox thing', s: 'inbox', at: '2026-09-01' }, { id: 'o2', t: 'Old errand', s: 'errand', wk, v: 'body' }, { id: 'o3', t: 'Learn Spanish', s: 'project', next: 'Find a class' }, { id: 'o4', t: 'Paint the hall', s: 'someday' }, { id: 'o5', t: 'Old done', s: 'done', doneAt: '2026-10-01', wk }] };
    localStorage.setItem('__mockstore', JSON.stringify(st)); });
  await p.reload(); await p.waitForTimeout(2000);
  const moved = await items('in-u1'), byT = t => moved.find(x => x.t === t);
  st = await store();
  ok('old tasks move into the Inbox once, by their old ids', byT('Old inbox thing') && byT('Old inbox thing').id === 'o1' && st['users/u1/docs/tasks'].moved, moved.map(x => x.t));
  ok('…keeping what they were', /^w-/.test(byT('Old errand').wk) && byT('Old errand').v === 'body' && byT('Learn Spanish').sub[0].t === 'Find a class' && byT('Paint the hall').st === 'some' && byT('Old done').st === 'done' && byT('Old done').open === false);
  await p.reload(); await p.waitForTimeout(1500);
  ok('…and only once', (await items('in-u1')).filter(x => x.t === 'Old inbox thing').length === 1);
  ok('no page errors', errs.length === 0, errs);
  report(`lists ${W}${dark ? 'd' : ''}`, R);
  await b.close();
})().catch(e => { console.log('CRASH', e.message.split('\n').slice(0, 4).join(' | ')); report('lists', R); process.exit(1); });

// Together: share a list by invite link, work on it from two accounts live, assign, remove; watchers (accountability
// partners) see your week and cheer; the invite banner before signing in; stopped links; leaving; account deletion
const { chromium, NAME } = require('./engine');
const { newCtx, newPage, onboard, report, launch, W, dark, S } = require('./harness');
const R = []; const ok = (n, c, i) => R.push({ n, pass: !!c, i: c ? undefined : i });
const U = (uid, name, email) => ({ uid, displayName: name, email, photoURL: '', providerData: [{ providerId: 'google.com' }], metadata: { lastSignInTime: new Date().toUTCString() } });
const AYUSH = U('u1', 'Ayush Jain', 'a@example.com'), PRIYA = U('u2', 'Priya Shah', 'p@example.com'), SAM = U('u3', 'Sam Lee', 's@example.com');
(async () => { const b = await launch(chromium);
  const ctx = await newCtx(b);
  const A = await newPage(ctx, { user: AYUSH }), B = await newPage(ctx, { user: PRIYA });
  const store = () => A.p.evaluate(() => JSON.parse(localStorage.getItem('__mockstore') || '{}'));
  const items = async lid => Object.entries(await store()).filter(([k]) => k.startsWith(`lists/${lid}/items/`)).map(([k, v]) => Object.assign({ id: k.split('/').pop() }, v));
  const settle = (pg, ms = 600) => pg.p.waitForTimeout(ms);
  await onboard(A); await onboard(B, ['rel', 'learn']);
  // Ayush makes a list and an invite link
  await A.tap('[data-act=tab][data-t=tasks]'); await A.tap('[data-act=lNew]'); await A.p.locator('#nlName').fill('Trip to Goa'); await A.p.locator('#nlName').press('Enter'); await settle(A);
  let st = await store(); const lid = Object.keys(st).find(k => /^lists\/l-/.test(k) && st[k].name === 'Trip to Goa').split('/')[1];
  await A.p.locator('#qAdd').fill('Book flights fri'); await A.p.keyboard.press('Enter'); await settle(A, 300);
  await A.tap('.lhead [data-act=lShare]');
  ok('Share sheet: just you so far, and a way to invite', /Share “Trip to Goa”/.test(await A.text('.sheet')) && await A.p.locator('.sheet .prow').count() === 1 && await A.p.locator('.sheet [data-act=invMake]').count() === 1);
  if (NAME === 'chromium') await A.p.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});   // other engines don't have these permissions
  await A.tap('.sheet [data-act=invMake]'); await settle(A);
  const link = await A.p.locator('.sheet .invlink input').inputValue().catch(() => '');
  const tok = (link.match(/invite=([\w-]+)/) || [])[1];
  st = await store();
  ok('an invite link is made: long, random, says who and which list, expires in 14 days', tok && tok.length >= 30 && st['invites/' + tok] && st['invites/' + tok].kind === 'list' && st['invites/' + tok].list === lid && st['invites/' + tok].from === 'u1' && st['invites/' + tok].name === 'Ayush Jain' && Math.round((st['invites/' + tok].exp - Date.now()) / 864e5) === 14, link);
  await A.p.screenshot({ path: `${S}/collab-share-${W}${dark ? 'd' : ''}.png` });
  await A.tap('.sheet [data-act=closeSheet] >> nth=0');
  // before signing in, the landing page says who invited you
  const C = await newPage(ctx);
  await C.p.addInitScript(() => sessionStorage.setItem('__mockuserTab', 'null'));
  await C.p.goto(link); await C.p.waitForTimeout(1500);
  ok('signed out: the landing page says who invited you to what', /Ayush invited you to the list “Trip to Goa”/.test(await C.text('.invbanner')), await C.text('#main').then(t => t.slice(0, 200)));
  ok('…and the link is tidied out of the address bar', !/invite=/.test(C.p.url()));
  await C.p.screenshot({ path: `${S}/collab-landing-${W}${dark ? 'd' : ''}.png` });
  await C.p.close();
  // Priya opens the link
  await B.p.goto(link); await B.p.waitForTimeout(1500);
  ok('Priya is asked: join “Trip to Goa”?', /Join “Trip to Goa”\?/.test(await B.text('.sheet')) && /Ayush shared this list/.test(await B.text('.sheet')), await B.text('.sheet'));
  await B.p.screenshot({ path: `${S}/collab-join-${W}${dark ? 'd' : ''}.png` });
  await B.tap('.sheet [data-act=invYes]'); await settle(B, 900);
  st = await store();
  ok('joining adds her to the list, with her name', JSON.stringify(st['lists/' + lid].members) === '["u1","u2"]' && st['lists/' + lid].people.u2.n === 'Priya Shah', st['lists/' + lid]);
  ok('she lands in the list and sees Ayush\'s task', /Trip to Goa/.test(await B.text('.lname')) && /Book flights/.test(await B.text('.lview')));
  ok('her list header says who it\'s shared with', /Shared with Ayush/.test(await B.text('.lhead')));
  await settle(A, 800);
  ok('Ayush sees she joined', /Shared with Priya/.test(await A.text('.lhead')) && await A.p.locator('.lhead .avs i').count() === 1);
  // live, both ways
  await B.p.locator('#qAdd').fill('Pack sunscreen'); await B.p.keyboard.press('Enter'); await settle(B, 800);
  ok('Priya adds a task: it appears for Ayush without reloading', /Pack sunscreen/.test(await A.text('.lview')));
  await A.tap('.lrow .ltx:has-text("Pack sunscreen")');
  ok('a shared task can be given to someone', await A.p.locator('.sheet [data-act=iWho]').count() === 3);
  await A.tap('.sheet [data-act=iWho]:has-text("Priya")'); await A.tap('.sheet [data-act=closeSheet] >> nth=0'); await settle(B, 800);
  ok('Priya sees it is hers', /Pack sunscreen[\s\S]*You/.test(await B.text('.lview')), { b: await B.text('.lview'), who: (await items(lid)).map(x => x.t + ':' + x.who) });
  await B.tap('.lrow:has-text("Book flights") [data-act=iDone]'); await settle(A, 900);
  const bf = (await items(lid)).find(x => /Book flights/.test(x.t));
  ok('she ticks Ayush\'s task: done, by her', bf.open === false && bf.doneBy === 'u2', bf);
  if (!(await A.p.locator('#tsec-done-' + lid + '.open').count())) await A.tap(`[data-act=tFold][data-k="done-${lid}"]`);
  ok('Ayush sees “Priya did it”', /Book flights[\s\S]*Priya did it/.test(await A.text('.lview')), await A.text('.lview'));
  await A.p.screenshot({ path: `${S}/collab-list-${W}${dark ? 'd' : ''}.png` });
  // a stopped link no longer lets anyone in
  await A.tap('.lhead [data-act=lShare]'); await A.tap('.sheet [data-act=invStop]'); await settle(A);
  ok('Stop this link deletes it', !(await store())['invites/' + tok]);
  await A.tap('.sheet [data-act=closeSheet] >> nth=0');
  const D = await newPage(ctx, { user: SAM }); await onboard(D, ['rel']);
  await D.p.goto(link); await D.p.waitForTimeout(1500);
  ok('opening a stopped link says it expired, and lets nobody in', await D.p.locator('.sheet [data-act=invYes]').count() === 0 && JSON.stringify((await store())['lists/' + lid].members) === '["u1","u2"]');
  await D.p.close();
  // watcher: Priya keeps an eye on Ayush's week
  await A.tap('[data-act=tab][data-t=compass]'); await A.tap('[data-act=cSec][data-k=watch]');
  ok('Compass → Accountability partner explains it and invites', /Accountability partner/.test(await A.text('#csec-watch')) && /Harkin/.test(await A.text('#csec-watch')));
  await A.tap('#csec-watch [data-act=invMake]'); await settle(A);
  const wlink = await A.p.locator('#csec-watch .invlink input').inputValue();
  st = await store(); const wtok = wlink.match(/invite=([\w-]+)/)[1];
  ok('a watcher link, and a watch page with nobody on it yet', st['invites/' + wtok].kind === 'watch' && st['invites/' + wtok].watch === 'u1' && st['watch/u1'] && JSON.stringify(st['watch/u1'].watchers) === '[]');
  // Ayush logs something so there is a week to see
  await A.tap('[data-act=tab][data-t=today]'); const firstPlus = A.p.locator('[data-act=inc]').first(); if (await firstPlus.count()) { await A.tap('[data-act=inc] >> nth=0'); } await settle(A, 2200);
  st = await store();
  ok('Ayush\'s week is published for watchers: floors with counts', st['watch/u1'].week && st['watch/u1'].week.id && Array.isArray(st['watch/u1'].week.floors) && st['watch/u1'].week.floors.length > 0 && st['watch/u1'].name === 'Ayush Jain', st['watch/u1']);
  await B.p.goto(wlink); await B.p.waitForTimeout(1500);
  ok('Priya is asked to be his watcher, and told nothing of hers is shared', /Be Ayush's watcher\?/.test(await B.text('.sheet')) && /Nothing about your own week is shared/.test(await B.text('.sheet')));
  await B.tap('.sheet [data-act=invYes]'); await settle(B, 900);
  st = await store();
  ok('she becomes a watcher', JSON.stringify(st['watch/u1'].watchers) === '["u2"]' && st['watch/u1'].people.u2.n === 'Priya Shah');
  await B.tap('[data-act=tab][data-t=today]'); await settle(B);
  ok('her Today shows who she\'s cheering on, with this week\'s count', /You're cheering on/i.test(await B.text('#main')) && /Ayush Jain[\s\S]*floors held this week/.test(await B.text('#main')));
  await B.tap('[data-act=wOpen]');
  ok('opening it shows his floors this week', /Ayush Jain's week/.test(await B.text('.sheet')) && await B.p.locator('.sheet .wf').count() > 0);
  await B.p.screenshot({ path: `${S}/collab-watching-${W}${dark ? 'd' : ''}.png` });
  await B.tap('.sheet [data-act=cheer] >> nth=0'); await settle(A, 900);
  st = await store(); const ch = Object.entries(st).filter(([k]) => k.startsWith('watch/u1/cheers/'));
  ok('a cheer is sent', ch.length === 1 && ch[0][1].from === 'u2' && /Nice going/.test(ch[0][1].text));
  await A.tap('[data-act=tab][data-t=today]'); await settle(A);
  ok('Ayush sees the cheer on Today', /A cheer from Priya/.test(await A.text('.cheers')) && /Nice going/.test(await A.text('.cheers')));
  await A.p.screenshot({ path: `${S}/collab-cheer-${W}${dark ? 'd' : ''}.png` });
  await A.tap('.cheers [data-act=cheerSeen]'); await settle(A);
  ok('Thanks clears it', await A.p.locator('.cheers').count() === 0 && !Object.keys(await store()).some(k => k.startsWith('watch/u1/cheers/')));
  // only the summary
  await A.tap('[data-act=tab][data-t=compass]'); if (!(await A.p.locator('#csec-watch [data-act=wShare]').count())) await A.tap('[data-act=cSec][data-k=watch]');
  ok('his watcher is listed', /Priya Shah/.test(await A.text('#csec-watch .people')));
  await A.tap('#csec-watch [data-act=wShare][data-v=summary]'); await settle(A, 1500);
  st = await store();
  ok('“Only how many held”: no floor names are published', st['watch/u1'].share === 'summary' && !st['watch/u1'].week.floors && typeof st['watch/u1'].week.held === 'number', st['watch/u1'].week);
  // leaving and removing
  await B.tap('[data-act=tab][data-t=today]'); await B.tap('[data-act=wOpen]'); await B.tap('.sheet [data-act=wLeave]'); await settle(B);
  ok('Priya can stop watching', JSON.stringify((await store())['watch/u1'].watchers) === '[]' && await B.p.locator('[data-act=wOpen]').count() === 0);
  await A.tap('[data-act=tab][data-t=tasks]'); await A.tap(`[data-act=tv][data-v="${lid}"]`); await A.tap('.lhead [data-act=lShare]');
  await A.tap('.sheet [data-act=lRemove]'); await settle(B, 1000);
  ok('Ayush removes Priya from the list: it disappears for her', JSON.stringify((await store())['lists/' + lid].members) === '["u1"]' && await B.p.locator(`.tnav [data-v="${lid}"]`).count() === 0);
  /* she can't come back with a link from before */
  await A.tap('.sheet [data-act=invMake]'); await settle(A); const link2 = await A.p.locator('.sheet .invlink input').inputValue();
  await A.p.evaluate(() => { const st = JSON.parse(localStorage.getItem('__mockstore')); for (const k of Object.keys(st)) if (k.startsWith('invites/')) st[k].gen = 0; localStorage.setItem('__mockstore', JSON.stringify(st)); });   // an old link (made before the removal)
  await B.p.goto(link2); await B.p.waitForTimeout(1500); if (await B.p.locator('.sheet [data-act=invYes]').count()) { await B.tap('.sheet [data-act=invYes]'); await settle(B, 800); }
  ok('a removed person can\'t rejoin with an old link', JSON.stringify((await store())['lists/' + lid].members) === '["u1"]');
  await A.tap('.sheet [data-act=closeSheet] >> nth=0');
  // account deletion takes his lists, links and watch page
  await A.tap('#acctBtn'); await A.tap('[data-act=delAcct]'); await A.tap('[data-act=delAcctYes]'); await A.p.waitForTimeout(3000);
  st = await store();
  ok('deleting the account removes his lists and their tasks, invites and watch page', !st['lists/' + lid] && !Object.keys(st).some(k => k.startsWith(`lists/${lid}/`)) && !st['lists/in-u1'] && !st['watch/u1'] && !Object.values(st).some(v => v && v.from === 'u1' && v.kind), Object.keys(st).filter(k => /lists|watch|invites/.test(k)));
  ok('no page errors (Ayush)', A.errs.length === 0, A.errs);
  ok('no page errors (Priya)', B.errs.length === 0, B.errs);
  report(`collab ${W}${dark ? 'd' : ''}`, R);
  await b.close();
})().catch(e => { console.log('CRASH', e.message.split('\n').slice(0, 4).join(' | ')); report('collab', R); process.exit(1); });

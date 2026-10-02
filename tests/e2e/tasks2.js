// Tasks tab revamp: quick add, Do next, foldable lists, row actions sheet
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../public'), S = process.env.S;
const W = +(process.env.W || 390), H = +(process.env.H || 844), touch = process.env.T !== '0', dark = process.env.D === '1';
const results = []; const ok = (n, c, i) => results.push({ n, pass: !!c, i: c ? undefined : i });
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, colorScheme: dark ? 'dark' : 'light', deviceScaleFactor: 2 });
  await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort()); await ctx.route('http://compass.test/**', async route => { const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type;
    if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; } else if (p === '/firebase-config.js') { body = 'window.COMPASS_FIREBASE_CONFIG={apiKey:"t",authDomain:"x",projectId:"x",appId:"x"}'; type = 'text/javascript'; } else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
    route.fulfill({ status: 200, body, contentType: type }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const tap = async s => { const l = typeof s === 'string' ? p.locator(s).first() : s; await l.scrollIntoViewIfNeeded().catch(()=>{}); touch ? await l.tap() : await l.click(); await p.waitForTimeout(220); };
  const items = async () => { await p.waitForTimeout(900); return p.evaluate(() => (JSON.parse(localStorage.getItem('__mockstore'))['users/u1/docs/tasks'] || { items: [] }).items); };
  const byT = async t => (await items()).find(i => i.t === t);
  await p.goto('http://compass.test/'); await p.waitForTimeout(500); await tap('.lhero [data-act=signin]'); await p.waitForTimeout(600);
  await tap('[data-act=obNext]'); for (const v of ['rel', 'body', 'mind']) await tap(`[data-act=obValue][data-v=${v}]`); await tap('[data-act=obCore][data-v=body]');
  while (await p.locator('[data-act=obNext]').count()) await tap('[data-act=obNext]');
  await p.waitForTimeout(900);
  await tap('[data-act=tab][data-t=tasks]');
  ok('empty: friendly prompt, no empty sections', await p.locator('.tempty').count() === 1 && await p.locator('.tsec').count() === 0);
  await p.screenshot({ path: `${S}/t2-empty-${W}${dark ? 'd' : ''}.png` });
  // quick add: Enter adds one
  await tap('#tQuick'); await p.keyboard.type('Call mom about the weekend'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  ok('Enter adds to the inbox', (await byT('Call mom about the weekend'))?.s === 'inbox');
  ok('Inbox list shows what you added, open', await p.locator('#tsec-inbox .trow').count() === 1 && /Call mom/.test(await p.locator('#tsec-inbox').innerText()));
  ok('quick add box is cleared', (await p.locator('#tQuick').inputValue()) === '');
  // paste a list
  await p.locator('#tQuick').fill('- Renew passport\n- Book dentist\n• Learn Spanish\n4. Fix the bike light\nWater plants every Sunday');
  await tap('[data-act=capAdd][data-src=tQuick]'); await p.waitForTimeout(400);
  ok('pasted list adds each line, bullets stripped', (await items()).filter(i => i.s === 'inbox').length === 6 && !!(await byT('Fix the bike light')));
  ok('Do next suggests sorting the inbox', /Sort 6 new items/.test(await p.locator('.donext').innerText()));
  ok('Sort all button on the inbox', await p.locator('#tsec-inbox [data-act=sortStart]').count() === 1);
  // row actions
  await tap('#tsec-inbox .ttx:has-text("Renew passport")');
  ok('tapping a row opens its actions', await p.locator('.sheet .tmact').count() >= 5);
  await p.screenshot({ path: `${S}/t2-menu-${W}${dark ? 'd' : ''}.png` });
  await tap('.sheet [data-act=tWeek]'); await p.waitForTimeout(300);
  let it = await byT('Renew passport');
  ok('Do this week: becomes an errand for this week, sheet closes', it.s === 'errand' && !!it.wk && await p.locator('.sheet').count() === 0, it);
  ok('Do next now shows it with a big tick', /Renew passport/.test(await p.locator('.donext').innerText()) && await p.locator('.donext .tick.big').count() === 1);
  await tap('#tsec-inbox .ttx:has-text("Book dentist")'); await tap('.sheet [data-act=tLater]'); await p.waitForTimeout(300);
  it = await byT('Book dentist'); ok('Next up: errand without a week', it.s === 'errand' && !it.wk, it);
  ok('Next up list has a This week shortcut', await p.locator('#tsec-later [data-act=tWeek]').count() === 1);
  await tap('#tsec-inbox .ttx:has-text("Learn Spanish")'); await tap('.sheet [data-act=tProj]'); await p.waitForTimeout(300);
  ok('Make it a project: asks for the next step, focused', await p.locator('#tsec-proj input[id^=step-]').count() === 1 && await p.evaluate(() => /^step-/.test(document.activeElement.id)));
  await p.keyboard.type('Download an app and do lesson 1'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  it = await byT('Learn Spanish'); ok('project saved with its step', it.s === 'project' && it.next === 'Download an app and do lesson 1', it);
  await tap('#tsec-inbox .ttx:has-text("Water plants")'); await tap('.sheet [data-act=tRoutine]'); await p.waitForTimeout(300);
  ok('Make it a routine opens a new floor prefilled', await p.locator('.sheet #c-name').inputValue() === 'Water plants every Sunday');
  await tap('.sheet [data-act=saveComp]'); await p.waitForTimeout(300);
  ok('…and saving closes back to Tasks', await p.locator('.sheet').count() === 0 && (await byT('Water plants every Sunday')).s === 'component');
  // rename
  await tap('#tsec-inbox .ttx:has-text("Fix the bike light")'); await p.locator('#tm-text').fill('Fix the bike lights'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  ok('rename from the sheet', !!(await byT('Fix the bike lights')));
  await tap('#tsec-inbox .ttx:has-text("Fix the bike lights")'); await tap('.sheet [data-act=tSomeday]'); await p.waitForTimeout(300);
  ok('Someday folded by default', (await byT('Fix the bike lights')).s === 'someday' && await p.locator('#tsec-some .trow').count() === 0 && /Someday\s*1/.test(await p.locator('#tsec-some').innerText()));
  await tap('#tsec-some [data-act=tFold]');
  ok('unfold Someday', await p.locator('#tsec-some .trow').count() === 1);
  // tick from Do next
  await tap('.donext .tick.big'); await p.waitForTimeout(500);
  it = await byT('Renew passport'); ok('ticking Do next marks done', it.s === 'done', it);
  ok('this week shows 1/1 with it struck through', /1\/1/.test(await p.locator('#tsec-week .tst').innerText()) && await p.locator('#tsec-week .trow.closed').count() === 1);
  ok('Do next moves on to the project step', /Download an app/.test(await p.locator('.donext').innerText()));
  await tap('.donext .tick.big'); await p.waitForTimeout(500);
  ok('ticking a step asks for the next one', await p.evaluate(() => /^step-/.test(document.activeElement.id)));
  await p.keyboard.type('Lesson 2'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  ok('next step saved', (await byT('Learn Spanish')).next === 'Lesson 2');
  // fold state survives reload
  await tap('#tsec-proj [data-act=tFold]'); await p.reload(); await p.waitForTimeout(1500); await tap('[data-act=tab][data-t=tasks]');
  ok('folded list stays folded after reload', await p.locator('#tsec-proj .proj').count() === 0 && await p.locator('#tsec-proj').count() === 1);
  await tap('#tsec-proj [data-act=tFold]');
  await tap('#tsec-later [data-act=tWeek]'); await p.waitForTimeout(300);
  ok('This week shortcut from Next up', (await byT('Book dentist')).wk);
  // done list + undo
  await tap('#tsec-done [data-act=tFold]');
  await tap('#tsec-done .ttx:has-text("Renew passport")'); await tap('.sheet [data-act=tUndo]'); await p.waitForTimeout(300);
  ok('Not done after all restores it', (await byT('Renew passport')).s === 'errand');
  await p.screenshot({ path: `${S}/t2-full-${W}${dark ? 'd' : ''}.png`, fullPage: true });
  const ov = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  ok('no sideways scroll', !ov);
  ok('no page errors', !errs.length, errs);
  console.log(`tasks2 ${W}${dark ? 'd' : ''}: ${results.filter(x => x.pass).length}/${results.length} passed`); results.filter(x => !x.pass).forEach(x => console.log('  FAIL', x.n, JSON.stringify(x.i || '').slice(0, 400)));
  await b.close(); })();

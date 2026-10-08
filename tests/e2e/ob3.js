const { chromium } = require('./engine');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../public'), S = process.env.S;
const W = +(process.env.W || 390), H = +(process.env.H || 844), dark = process.env.D === '1', touch = process.env.T !== '0';
const results = []; const ok = (name, cond, info) => results.push({ name, pass: !!cond, info: cond ? undefined : info });
const tag = `${W}${touch ? 't' : ''}${dark ? 'd' : ''}`;
async function open(b, init) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light' });
  await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort()); await ctx.route('http://compass.test/**', async route => {
    const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type;
    if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; }
    else if (p === '/firebase-config.js') { body = 'window.COMPASS_FIREBASE_CONFIG={apiKey:"test",authDomain:"x",projectId:"x",appId:"x"}'; type = 'text/javascript'; }
    else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
    route.fulfill({ status: 200, body, contentType: type });
  });
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const tap = async sel => { const l = typeof sel === 'string' ? p.locator(sel).first() : sel; await l.scrollIntoViewIfNeeded().catch(() => {}); return touch ? l.tap({ timeout: 8000 }) : l.click({ timeout: 8000 }); };
  await p.goto('http://compass.test/'); await p.waitForTimeout(500);
  await tap('.lhero [data-act=signin]'); await p.waitForTimeout(700);
  return { ctx, p, errs, tap };
}
const store = p => p.evaluate(() => JSON.parse(localStorage.getItem('__mockstore') || '{}'));
const prof = async p => (await store(p))['users/u1/docs/profile'] || {};
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, channel: process.env.CHROMIUM ? undefined : 'chromium' });
  /* A. the plain path */
  { const { ctx, p, errs, tap } = await open(b); const shot = n => p.screenshot({ path: `${S}/o3-${n}-${tag}.png`, fullPage: true });
    ok('A welcome offers Start, Import and 5 templates', await p.locator('[data-act=obNext]').innerText() === 'Start' && await p.locator('[data-act=impOpen]').count() === 1 && await p.locator('[data-act=obStarter]').count() === 5);
    ok('A no colour picker in setup', await p.locator('.swatches').count() === 0);
    await tap('[data-act=obNext]'); await p.waitForTimeout(250);
    ok('A step label says 1 of 3', /Step 1 of 3/i.test(await p.locator('.obprog').innerText()));
    ok('A Continue is off until a value is picked', await p.locator('[data-act=obNext]').isDisabled());
    await p.fill('#ob-goal', 'Fitter and calmer');
    for (const v of ['rel', 'body', 'mind', 'solve']) await tap(`[data-act=obValue][data-v=${v}]`);
    ok('A goal is optional (Continue on without it too)', !(await p.locator('[data-act=obNext]').isDisabled()));
    ok('A stars appear only on picked values', await p.locator('[data-act=obCore]').count() === 4);
    await tap('[data-act=obCore][data-v=body]'); await tap('[data-act=obCore][data-v=rel]'); await tap('[data-act=obCore][data-v=mind]'); await p.waitForTimeout(200);
    ok('A a third star is refused', await p.locator('[data-act=obCore][aria-pressed=true]').count() === 2 && /Two stars/.test(await p.locator('.toast').innerText().catch(() => '')));
    await tap('[data-act=obCore][data-v=rel]');
    for (const v of ['learn', 'money', 'create', 'time', 'world', 'serve']) await tap(`[data-act=obValue][data-v=${v}]`);
    ok('A nine values at most', await p.locator('[data-act=obValue][aria-pressed=true]').count() === 9 && /Nine is plenty/.test(await p.locator('.toast').innerText().catch(() => '')));
    for (const v of ['learn', 'money', 'create', 'time', 'world']) await tap(`[data-act=obValue][data-v=${v}]`);
    await shot('values');
    await tap('[data-act=obNext]'); await p.waitForTimeout(250);
    ok('A week step starts on Office 9–5', await p.locator('[data-act=obPreset][data-v=office]').getAttribute('aria-pressed') === 'true');
    const h0 = await p.locator('.weekres b').innerText();
    await tap('[data-act=obPreset][data-v=student]'); await p.waitForTimeout(150);
    const h1 = await p.locator('.weekres b').innerText();
    ok('A picking a preset updates the hours', h0 !== h1 && /h a week/.test(h1), { h0, h1 });
    await tap('[data-act=obWeekAdv]'); await p.waitForTimeout(150);
    ok('A Adjust opens the detailed form', await p.locator('[data-act=wkStep][data-k=sleep]').count() >= 1);
    await tap('[data-act=wkStep][data-k=sleep] >> nth=1'); await p.waitForTimeout(150);
    await shot('week');
    await tap('[data-act=obNext]'); await p.waitForTimeout(350);
    const ticked = async v => p.locator(`.vgroup:has(.gh .vdot) .obrow .check[aria-pressed=true]`).count();
    const perValue = await p.evaluate(() => [...document.querySelectorAll('.vgroup')].filter(g => g.querySelector('.obmore')).map(g => ({ v: g.querySelector('.gh b').textContent.trim(), n: g.querySelectorAll('.obrow .check[aria-pressed=true]').length })));
    ok('A Core gets 2 floors ticked, others 1', perValue.find(x => /Physical/.test(x.v)).n === 2 && perValue.filter(x => !/Physical/.test(x.v)).every(x => x.n === 1), perValue);
    ok('A Cores listed first', /Physical/.test(perValue[0].v));
    const moreBtn = p.locator('.vgroup:has-text("Deep relationships") [data-act=obMore]');
    const rowsBefore = await p.locator('.vgroup:has-text("Deep relationships") .obrow').count();
    await tap(moreBtn); await p.waitForTimeout(200);
    ok('A More ideas reveals the rest and an add box', await p.locator('.vgroup:has-text("Deep relationships") .obrow').count() > rowsBefore && await p.locator('.vgroup:has-text("Deep relationships") form.obAdd').count() === 1);
    await p.fill('.vgroup:has-text("Deep relationships") form.obAdd input', 'Dinner with Sam'); await tap('.vgroup:has-text("Deep relationships") form.obAdd button'); await p.waitForTimeout(200);
    ok('A adding your own ticks it', await p.locator('.obrow:has-text("Dinner with Sam") .check[aria-pressed=true]').count() === 1);
    await tap('.vgroup:has-text("Deep relationships") [data-act=obMore]'); await p.waitForTimeout(150);
    ok('A your own stays visible after closing More', await p.locator('.obrow:has-text("Dinner with Sam")').count() === 1);
    await tap('.obrow:has-text("Workout") .check'); await p.waitForTimeout(150);
    ok('A unticking keeps the row in view', await p.locator('.obrow:has-text("Workout") .check[aria-pressed=false]').count() === 1);
    await tap('.obrow:has-text("Workout") .check');
    await tap('.obrow:has-text("Dinner with Sam") [data-act=obEdit]'); await p.waitForTimeout(150);
    ok('A ✎ opens the editor with Remove', await p.locator('.obedit [data-act=obDel]').count() === 1);
    await tap('.obedit [data-act=obDel]'); await p.waitForTimeout(150);
    ok('A Remove deletes it', await p.locator('.obrow:has-text("Dinner with Sam")').count() === 0);
    await shot('floors');
    await tap('[data-act=obBack]'); await p.waitForTimeout(200);
    ok('A Back goes to the week step', /normal weekday/.test(await p.locator('h1').innerText()));
    await tap('[data-act=obNext]'); await p.waitForTimeout(200);
    await tap('[data-act=obNext]'); await p.waitForTimeout(700);
    ok('A lands on Today with the intro card', await p.locator('.intro:has-text("How Compass works")').count() === 1);
    const pr = await prof(p);
    ok('A profile saved: values, one Core, goal, preset week', pr.values.length === 4 && pr.cores.length === 1 && pr.cores[0].value === 'body' && pr.goal === 'Fitter and calmer' && pr.week.preset === 'student', { v: pr.values, c: pr.cores, w: pr.week && pr.week.preset });
    ok('A safety-net defaults include sleep and the journal', ['sleep', 'journal'].every(id => (pr.components.find(c => c.id === id) || {}).mvw === true), pr.components.map(c => c.id + ':' + !!c.mvw));
    ok('A the Core has a safety-net floor', pr.components.some(c => c.value === 'body' && c.mvw));
    ok('A pending: week off (details adjusted), cores and safety on', pr.pending && pr.pending.week === false && pr.pending.cores && pr.pending.safety && pr.pending.intro, pr.pending);
    await shot('today');
    await tap('[data-act=introDone]'); await p.waitForTimeout(250);
    ok('A Got it hides the intro', await p.locator('.intro:has-text("How Compass works")').count() === 0);
    await tap('[data-act=tab][data-t=week]'); await tap('[data-act=weekView][data-v=plan]'); await p.waitForTimeout(250);
    ok('A no week check on Plan after adjusting details', await p.locator('.intro:has-text("Check your week")').count() === 0);
    await tap('[data-act=tab][data-t=review]'); await p.waitForTimeout(250);
    ok('A Review holds back the setup questions in week one', await p.locator('text=Finish setting up').count() === 0);
    /* a week later: the Review asks about Cores and the safety net */
    await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('__mockstore')); const d = new Date(Date.now() - 7 * 864e5); s['users/u1/docs/profile'].onboardedAt = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); localStorage.setItem('__mockstore', JSON.stringify(s)); });
    await p.reload(); await p.waitForTimeout(900); await tap('[data-act=tab][data-t=review]'); await p.waitForTimeout(300);
    ok('A after a week, Review asks to finish setting up', await p.locator('text=Which one or two deserve more energy').count() === 1 && await p.locator('text=Build a safety net').count() === 1);
    await tap('.card:has-text("deserve more energy") [data-act=toggleCore][data-v=mind]'); await p.waitForTimeout(1000);
    ok('A picking a Core there works', (await prof(p)).cores.map(c => c.value).includes('mind'));
    await tap('[data-act=coresDone]'); await p.waitForTimeout(250);
    ok('A Done hides the Core question', await p.locator('text=Which one or two deserve more energy').count() === 0);
    const mv = p.locator('[data-act=mvwToggle]').first(); const was = await mv.getAttribute('aria-pressed'); await tap(mv); await p.waitForTimeout(250);
    ok('A safety-net toggles work', await p.locator('[data-act=mvwToggle]').first().getAttribute('aria-pressed') !== was);
    await shot('review');
    await tap('[data-act=safetyDone]'); await p.waitForTimeout(250);
    ok('A Done hides the safety net', await p.locator('text=Build a safety net').count() === 0);
    /* run setup again: existing data, starts at values */
    await tap('[data-act=tab][data-t=compass]'); await p.waitForTimeout(250); if (!(await p.locator('[data-act=redoOb]').count())) await tap('[data-act=cSec][data-k=app]'); await tap('[data-act=redoOb]'); await p.waitForTimeout(300);
    ok('A Run setup again starts at values with my picks', /What matters/.test(await p.locator('h1').innerText()) && await p.locator('[data-act=obValue][aria-pressed=true]').count() === 4);
    ok('no page errors (A)', errs.length === 0, errs); await ctx.close(); }
  /* B. a starter template */
  { const { ctx, p, errs, tap } = await open(b); const shot = n => p.screenshot({ path: `${S}/o3-${n}-${tag}.png`, fullPage: true });
    await tap('[data-act=obStarter][data-v=health]'); await p.waitForTimeout(350);
    ok('B template opens the single review screen', /Your floors/.test(await p.locator('h1').innerText()) && /Health reset/.test(await p.locator('.obsum').innerText()));
    ok('B template fills starred Cores', (await p.locator('.obsum .chip:has(.cstar)').allInnerTexts()).map(t => t.replace(/[★\s]+/g, ' ').trim()).sort().join() === 'Mental fitness,Physical fitness' && await p.locator('.obsum .chip.sel').count() === 0);
    ok('B template ticks its 7 floors', await p.locator('.obrow .check[aria-pressed=true]').count() === 7, await p.locator('.obrow .check[aria-pressed=true]').count());
    await shot('starter');
    await tap('[data-act=obJump][data-step="2"]'); await p.waitForTimeout(200);
    ok('B Change week opens the week step', /normal weekday/.test(await p.locator('h1').innerText()));
    await tap('[data-act=obPreset][data-v=long]'); await tap('[data-act=obNext]'); await p.waitForTimeout(250);
    ok('B Continue returns to the floors', /Your floors/.test(await p.locator('h1').innerText()) && /Long hours/.test(await p.locator('.obsum').innerText()));
    await tap('[data-act=obJump][data-step="1"]'); await p.waitForTimeout(200);
    ok('B Change values shows the template values', await p.locator('[data-act=obValue][aria-pressed=true]').count() === 4);
    await tap('[data-act=obNext]'); await tap('[data-act=obNext]'); await p.waitForTimeout(250);
    await tap('[data-act=obNext]'); await p.waitForTimeout(700);
    const pr = await prof(p);
    ok('B saved as the template says', pr.cores.map(c => c.value).sort().join() === 'body,mind' && pr.components.filter(c => !c.fun).length === 7 && pr.week.preset === 'long', { c: pr.cores, n: pr.components.length, w: pr.week.preset });
    await tap('[data-act=introDone]').catch(() => {});
    await tap('[data-act=tab][data-t=week]'); await tap('[data-act=weekView][data-v=plan]'); await p.waitForTimeout(250);
    ok('B Plan asks to check the week (preset only)', await p.locator('.intro:has-text("Check your week")').count() === 1 && /Long hours/.test(await p.locator('.intro').innerText()));
    await shot('plan');
    await tap('[data-act=weekOk]'); await p.waitForTimeout(250);
    ok('B Looks right hides it', await p.locator('.intro:has-text("Check your week")').count() === 0);
    ok('no page errors (B)', errs.length === 0, errs); await ctx.close(); }
  /* C. resuming a half-finished setup, and a draft from the old, longer flow */
  { const { ctx, p, errs, tap } = await open(b);
    await tap('[data-act=obNext]'); await tap('[data-act=obValue][data-v=body]'); await tap('[data-act=obValue][data-v=rel]'); await tap('[data-act=obNext]'); await p.waitForTimeout(900);
    await p.reload(); await p.waitForTimeout(1200);
    ok('C a half-finished setup resumes where it stopped', /normal weekday/.test(await p.locator('h1').innerText().catch(() => '')));
    await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('__mockstore')); const dr = s['users/u1/docs/obdraft']; dr.step = 6; delete dr.flow; localStorage.setItem('__mockstore', JSON.stringify(s)); });
    await p.reload(); await p.waitForTimeout(1200);
    ok('C an old-flow draft resumes at values', /What matters/.test(await p.locator('h1').innerText().catch(() => '')) && await p.locator('[data-act=obValue][aria-pressed=true]').count() === 2);
    ok('no page errors (C)', errs.length === 0, errs); await ctx.close(); }
  const fails = results.filter(r => !r.pass);
  console.log(`${tag}: ${results.length - fails.length}/${results.length} passed`); fails.forEach(f => console.log('  FAIL', f.name, JSON.stringify(f.info || '').slice(0, 300)));
  await b.close();
})().catch(e => { console.log('CRASH', e.message.split('\n').slice(0, 3).join(' | ')); results.filter(r => !r.pass).forEach(f => console.log('  FAIL', f.name, JSON.stringify(f.info || '').slice(0, 300))); console.log('passed so far', results.filter(r => r.pass).length); process.exit(1); });

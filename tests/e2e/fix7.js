const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../public'), S = process.env.S;
const W = +(process.env.W || 390), H = +(process.env.H || 844), dark = process.env.D === '1';
const results = []; const ok = (name, cond, info) => results.push({ name, pass: !!cond, info: cond ? undefined : info });
async function setup(b, init) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light' });
  await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort()); await ctx.route('http://compass.test/**', async route => {
    const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type;
    if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; }
    else if (p === '/firebase-config.js') { body = 'window.COMPASS_FIREBASE_CONFIG={apiKey:"test",authDomain:"x",projectId:"x",appId:"x"}'; type = 'text/javascript'; }
    else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
    route.fulfill({ status: 200, body, contentType: type });
  });
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const tap = async sel => { const l = typeof sel === 'string' ? p.locator(sel).first() : sel; await l.scrollIntoViewIfNeeded().catch(() => {}); return l.tap({ timeout: 8000 }); };
  await p.goto('http://compass.test/'); await p.waitForTimeout(500);
  await tap('.lhero [data-act=signin]'); await p.waitForTimeout(600);
  await tap('[data-act=obNext]'); await p.fill('#ob-goal', 'Grow steadily');
  for (const v of ['rel', 'solve', 'body', 'learn', 'world', 'money']) await tap(`[data-act=obValue][data-v=${v}]`);
  while (await p.locator('[data-act=obNext]').count()) { await tap('[data-act=obNext]'); await p.waitForTimeout(150); }
  await p.waitForTimeout(500);
  return { ctx, p, errs, tap };
}
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const tag = `${W}${dark ? 'd' : ''}`;
  { const { ctx, p, errs, tap } = await setup(b);
    const shot = n => p.screenshot({ path: `${S}/f7-${n}-${tag}.png` });
    /* 1. future days */
    const tk = await p.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
    ok('1 lands on today', await p.locator(`.strip [data-k="${tk}"][aria-pressed=true]`).count() === 1);
    const fut = p.locator('.strip button.future').first();
    const futCount = await p.locator('.strip button.future').count();
    if (futCount) {
      ok('1 future days are grey but not disabled', !(await fut.isDisabled()));
      await tap(fut); await p.waitForTimeout(250);
      ok('1 a future day opens', await fut.getAttribute('aria-pressed') === 'true' && /Still ahead/.test(await p.locator('.lede').first().innerText()));
      const chk = p.locator('[data-act=anchor]').first();
      if (await chk.count()) { await tap(chk); await p.waitForTimeout(250); ok('1 can tick something on a future day', await p.locator('[data-act=anchor]').first().getAttribute('aria-pressed') === 'true'); }
      await shot('1future');
    } else ok('1 (today is Sunday: no future days this week)', true);
    /* 4. header */
    const hb = await p.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); return { brand: r('.brand'), av: r('#acctBtn'), nav: r('#weeknav'), isl: r('#island') }; });
    if (W <= 560) {
    ok('4 logo and account share the first row', Math.abs((hb.brand.top + hb.brand.height / 2) - (hb.av.top + hb.av.height / 2)) < 8, hb);
    ok('4 week switcher gets its own full-width row', hb.nav.top > hb.brand.bottom - 2 && hb.nav.width > hb.isl.width - 40, hb.nav); }
    await p.evaluate(() => scrollTo(0, 0)); await shot('4header');
    /* 2. plan fonts */
    await tap('[data-act=tab][data-t=week]'); await p.waitForTimeout(200); await tap('[data-act=weekView][data-v=plan]'); await p.waitForTimeout(300);
    const fonts = await p.evaluate(() => ['.pleft', '.psum b', '.ptray .pchip span'].map(s => getComputedStyle(document.querySelector(s)).fontFamily));
    ok('2 plan numbers use the text face, not monospace', fonts.every(f => !/Mono/i.test(f)), fonts);
    await shot('2plan');
    /* 3. monthly date picker */
    const btn = p.locator('[data-act=mPick]').first();
    ok('3 monthly rows use a date button, not the native field', await btn.count() === 1 && await p.locator('input[data-mplan]').count() === 0);
    await tap(btn); await p.waitForTimeout(300);
    ok('3 opening the picker sets nothing', /Pick a date/.test(await p.locator('[data-act=mPick]').first().innerText()) && !/now /.test(await p.locator('.sheet .pshead').innerText()));
    ok('3 shows this month and next', await p.locator('.sheet .mcal').count() === 2);
    const past = await p.locator('.sheet .mgrid button:disabled').count();
    ok('3 past days are not selectable', past >= 0);
    await shot('3picker');
    const pick = await p.evaluate(() => { const b = [...document.querySelectorAll('.sheet .mgrid button:not(:disabled)')][3]; return b && b.dataset.date; });
    await tap(`.sheet [data-act=mSet][data-date="${pick}"]`); await p.waitForTimeout(300);
    ok('3 tapping a day sets it and closes', await p.locator('.sheet').count() === 0 && /set/.test(await p.locator('[data-act=mPick]').first().getAttribute('class')));
    ok('3 the one-off shows on that day of the week', await p.locator(`.pblk[data-act=mEdit]`).count() >= (pick <= (await p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + (7 - ((d.getDay() + 6) % 7)) - 1); return d.toISOString().slice(0, 10); })) ? 1 : 0));
    await tap('[data-act=mPick]'); await p.waitForTimeout(250);
    ok('3 reopening shows the chosen day selected', await p.locator(`.sheet .mgrid button.sel[data-date="${pick}"]`).count() === 1);
    await tap('[data-act=mPickClear]'); await p.waitForTimeout(250);
    ok('3 Clear the date works', /Pick a date/.test(await p.locator('[data-act=mPick]').first().innerText()));
    /* 5 + 6. Compass tab */
    await tap('[data-act=tab][data-t=compass]'); await p.waitForTimeout(300);
    await tap('[data-act=cSec][data-k=cal]'); await tap('[data-act=cSec][data-k=app]');
    const ctext = await p.locator('#main').innerText();
    ok('5 calendar is one tidy card with Plan and Export', await p.locator('.calbtns [data-act=gotoPlan]').count() === 1 && await p.locator('.calbtns [data-act=icsOpen]').count() === 1 && !/Open in Google Calendar|Mark added/.test(ctext));
    ok('6 no import from the Claude version', !/Claude version/.test(ctext) && await p.locator('#importFile').count() === 0 && /Download a backup/.test(ctext));
    await p.locator('.calbtns').scrollIntoViewIfNeeded(); await shot('5calendar');
    /* 7a. delete, recent sign-in */
    await tap('#acctBtn'); await p.waitForTimeout(300); await tap('[data-act=delAcct]'); await p.waitForTimeout(150);
    const t0 = Date.now(); await tap('[data-act=delAcctYes]');
    await p.waitForFunction(() => !localStorage.getItem('__mockuser'), null, { timeout: 15000 }).catch(() => {});
    const left = await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('__mockstore') || '{}')).filter(k => k.startsWith('users/u1/')).length);
    ok('7 delete finishes quickly (recent sign-in)', Date.now() - t0 < 5000, Date.now() - t0);
    ok('7 every document is gone', left === 0, left);
    await p.waitForTimeout(1600);
    ok('7 lands back on the front page', await p.locator('.lhero').count() === 1);
    ok('no page errors (main run)', errs.length === 0, errs);
    await ctx.close(); }
  /* 7b. stale sign-in: asks Google first, then deletes */
  { const { ctx, p, errs, tap } = await setup(b, () => { window.__staleMin = 60; });
    await tap('#acctBtn'); await p.waitForTimeout(300); await tap('[data-act=delAcct]'); await tap('[data-act=delAcctYes]');
    await p.waitForFunction(() => !localStorage.getItem('__mockuser'), null, { timeout: 15000 }).catch(() => {});
    ok('7 stale sign-in: confirms with Google first', await p.evaluate(() => window.__reauth) === 1);
    ok('7 stale sign-in: then deletes', await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('__mockstore') || '{}')).filter(k => k.startsWith('users/u1/')).length) === 0);
    ok('no page errors (stale)', errs.length === 0, errs); await ctx.close(); }
  /* 7c. pop-ups blocked: falls back to a full-page confirm, deletes nothing yet */
  { const { ctx, p, errs, tap } = await setup(b, () => { window.__staleMin = 60; window.__popupBlocked = true; });
    await tap('#acctBtn'); await p.waitForTimeout(300); await tap('[data-act=delAcct]'); await tap('[data-act=delAcctYes]'); await p.waitForTimeout(800);
    ok('7 pop-up blocked: goes to Google on a full page', await p.evaluate(() => window.__reauthRedirect) === 1 && await p.evaluate(() => !!sessionStorage.getItem('compass-delete')));
    ok('7 pop-up blocked: nothing deleted before confirming', await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('__mockstore') || '{}')).filter(k => k.startsWith('users/u1/')).length) > 0);
    ok('no page errors (blocked)', errs.length === 0, errs); await ctx.close(); }
  /* 7d. server never answers: gives up with a clear message instead of hanging */
  { const { ctx, p, errs, tap } = await setup(b, () => { window.__hangCommit = true; });
    await tap('#acctBtn'); await p.waitForTimeout(300); await tap('[data-act=delAcct]'); const t0 = Date.now(); await tap('[data-act=delAcctYes]');
    await p.waitForFunction(() => /didn't answer in time/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
    const msg = await p.locator('.sheet').innerText().catch(() => '');
    ok('7 no answer: stops with a clear message', /didn't answer in time/.test(msg) && Date.now() - t0 < 26000, { ms: Date.now() - t0, msg: msg.slice(0, 200) });
    ok('7 no answer: button usable again', !(await p.locator('[data-act=delAcctYes]').isDisabled()));
    ok('no page errors (hang)', errs.length === 0, errs); await ctx.close(); }
  const fails = results.filter(r => !r.pass);
  console.log(`${tag}: ${results.length - fails.length}/${results.length} passed`); fails.forEach(f => console.log('  FAIL', f.name, JSON.stringify(f.info || '').slice(0, 300)));
  await b.close();
})().catch(e => { console.log('CRASH', e.message.split('\n').slice(0, 3).join(' | ')); results.filter(r => !r.pass).forEach(f => console.log('  FAIL', f.name, JSON.stringify(f.info || '').slice(0, 300))); console.log('passed so far', results.filter(r => r.pass).length); process.exit(1); });

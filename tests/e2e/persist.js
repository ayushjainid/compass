// New onboarding: a half-finished setup survives reload and sign-out; goal, stars, week preset and floor edits are kept.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../public'), S = process.env.S;
const results = []; const ok = (name, cond, info) => results.push({ name, pass: !!cond, info: cond ? undefined : info });
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, channel: process.env.CHROMIUM ? undefined : 'chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort()); await ctx.route('http://compass.test/**', async route => {
    const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type;
    if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; }
    else if (p === '/firebase-config.js') { body = 'window.COMPASS_FIREBASE_CONFIG={apiKey:"test",authDomain:"x",projectId:"x",appId:"x"}'; type = 'text/javascript'; }
    else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
    route.fulfill({ status: 200, body, contentType: type });
  });
  let p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const tap = async sel => { const l = p.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.tap({ timeout: 8000 }); await p.waitForTimeout(120); };
  const h1 = () => p.locator('h1').first().innerText().catch(() => '');
  await p.goto('http://compass.test/'); await p.waitForTimeout(500);
  await tap('.lhero [data-act=signin]'); await p.waitForTimeout(600);
  await tap('[data-act=obNext]');
  await p.fill('#ob-goal', 'Keep this goal');
  await tap('[data-act=obValue][data-v=rel]'); await tap('[data-act=obValue][data-v=learn]'); await tap('[data-act=obCore][data-v=learn]');
  await tap('[data-act=obNext]');
  await tap('[data-act=obPreset][data-v=part]');
  await tap('[data-act=obNext]');
  ok('on the floors step', /Your floors/.test(await h1()), await h1());
  const firstOn = await p.locator('.obrow:has(.check[aria-pressed=true])').first().getAttribute('data-rid');
  await tap(`[data-act=obEdit][data-id="${firstOn}"]`);
  await p.fill(`[data-dur="${firstOn}"]`, '35 min'); await p.keyboard.press('Enter'); await p.waitForTimeout(100);
  await tap('[data-act=obEditDone]'); await p.waitForTimeout(900);
  const rowTxt = () => p.locator(`.obrow[data-rid="${firstOn}"]`).innerText().catch(() => '');
  ok('edit shows on the row', /35 min/.test(await rowTxt()), await rowTxt());

  await p.reload(); await p.waitForTimeout(1300);
  ok('reload: back on the floors step', /Your floors/.test(await h1()), await h1());
  ok('reload: floor edit kept', /35 min/.test(await rowTxt()), await rowTxt());
  await tap('[data-act=obBack]');
  ok('reload: week preset kept', await p.locator('[data-act=obPreset][data-v=part][aria-pressed=true]').count() === 1);
  await tap('[data-act=obBack]');
  ok('reload: goal kept', await p.inputValue('#ob-goal').catch(() => '') === 'Keep this goal');
  ok('reload: star kept', await p.locator('[data-act=obCore][data-v=learn][aria-pressed=true]').count() === 1);
  await tap('[data-act=obNext]'); await tap('[data-act=obNext]');

  // sign out mid-setup, close the tab, come back
  await tap('#acctBtn'); await tap('[data-act=signout]'); await p.waitForTimeout(900);
  ok('signed out', await p.locator('.lhero [data-act=signin]').count() === 1);
  await p.close(); p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://compass.test/'); await p.waitForTimeout(500);
  await tap('.lhero [data-act=signin]'); await p.waitForTimeout(1300);
  ok('sign back in: setup resumes on floors', /Your floors/.test(await h1()), await h1());
  ok('sign back in: floor edit kept', /35 min/.test(await rowTxt()), await rowTxt());

  await tap('[data-act=obNext]'); await p.waitForTimeout(900);
  ok('finishing lands in the app with the intro card', await p.locator('.intro').count() === 1);
  const prof = await p.evaluate(() => JSON.parse(localStorage.getItem('__mockstore') || '{}')['users/u1/docs/profile']);
  ok('profile saved goal, star and week preset', prof && prof.onboarded && /Keep this goal/.test(JSON.stringify(prof)) && prof.week && prof.week.preset === 'part' && (prof.cores || []).some(c => c.value === 'learn'), prof && { cores: prof.cores, week: prof.week });
  ok('profile keeps the edited length', prof && prof.components.some(c => c.id === firstOn && Math.abs(c.hours - 35 / 60) < 0.01), prof && prof.components.find(c => c.id === firstOn));
  ok('no page errors', errs.length === 0, errs);
  const fails = results.filter(r => !r.pass);
  console.log(`persist: ${results.length - fails.length}/${results.length} passed`); fails.forEach(f => console.log('  FAIL', f.name, JSON.stringify(f.info || '').slice(0, 400)));
  await b.close();
})().catch(e => { console.log('CRASH', e.message.split('\n').slice(0, 3).join(' | ')); results.filter(r => !r.pass).forEach(f => console.log('  FAIL', f.name, JSON.stringify(f.info || '').slice(0, 300))); process.exit(1); });

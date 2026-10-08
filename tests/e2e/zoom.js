const { chromium } = require('./engine');
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
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, channel: process.env.CHROMIUM ? undefined : 'chromium' });
  const { ctx, p, errs, tap } = await setup(b);
  const cdp = await ctx.newCDPSession(p);
  const scale = () => p.evaluate(() => visualViewport.scale);
  ok('viewport starts at 1', await scale() === 1);
  // double-tap on body text
  const lede = await p.locator('.lede').first().boundingBox();
  for (let k = 0; k < 2; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: lede.x + 40, y: lede.y + 10 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(90); }
  await p.waitForTimeout(600);
  ok('double-tap does not zoom', await scale() === 1, await scale());
  // pinch out
  await cdp.send('Input.synthesizePinchGesture', { x: 200, y: 400, scaleFactor: 2.5, relativeSpeed: 800, gestureSourceType: 'touch' }).catch(e => console.log('pinch n/a', e.message));
  await p.waitForTimeout(600);
  ok('pinch does not zoom', await scale() === 1, await scale());
  // two quick taps on a counter still count twice
  await tap('[data-act=tab][data-t=week]'); await p.waitForTimeout(200); await tap('[data-act=weekView][data-v=floors]'); await p.waitForTimeout(200);
  const plus = p.locator('.stepper [data-act=inc]').first(); await plus.scrollIntoViewIfNeeded();
  const v0 = await p.locator('.stepper .v').first().innerText();
  const pb = await plus.boundingBox();
  for (let k = 0; k < 2; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pb.x + pb.width / 2, y: pb.y + pb.height / 2 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(120); }
  await p.waitForTimeout(400);
  const v1 = await p.locator('.stepper .v').first().innerText();
  ok('two quick taps on + count twice', parseFloat(v1) - parseFloat(v0) === 2, { v0, v1 });
  ok('still at 1 after quick taps', await scale() === 1, await scale());
  ok('no page errors', errs.length === 0, errs);
  const fails = results.filter(r => !r.pass); console.log(`zoom: ${results.length - fails.length}/${results.length} passed`); fails.forEach(f => console.log('  FAIL', f.name, JSON.stringify(f.info || '')));
  await b.close();
})();

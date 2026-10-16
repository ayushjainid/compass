// Shared setup for the newer suites: a context serving public/ with the mock Firebase, a tap helper that works
// on touch and desktop, and quick access to the mock database.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../public');
const W = +(process.env.W || 390), H = +(process.env.H || 844), touch = process.env.T !== '0', dark = process.env.D === '1';

async function newCtx(b, { config = '', mock = 'mockfb.js' } = {}) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, colorScheme: dark ? 'dark' : 'light', deviceScaleFactor: 2 });
  await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort());
  await ctx.route('http://compass.test/**', async route => {
    const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type;
    if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, mock)); type = 'text/javascript'; }
    else if (p === '/firebase-config.js') { body = `self.COMPASS_FIREBASE_CONFIG={apiKey:"t",authDomain:"x",projectId:"x",appId:"x"};${config}`; type = 'text/javascript'; }
    else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
    route.fulfill({ status: 200, body, contentType: type });
  });
  return ctx;
}

/* one page; `user` makes this tab signed in as that person (collaboration tests open one tab per person) */
async function newPage(ctx, { user = null } = {}) {
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => { if (!/index\.html due to access control checks/.test(e.message)) errs.push(e.message); });
  if (user) await p.addInitScript(u => { if (!sessionStorage.getItem('__mockuserTab')) sessionStorage.setItem('__mockuserTab', JSON.stringify(u)); }, user);
  const tap = async (sel, o = {}) => {
    const l = typeof sel === 'string' ? p.locator(sel).first() : sel;
    await l.evaluate(e => e.scrollIntoView({ block: 'center', behavior: 'instant' })).catch(() => {});
    try { touch ? await l.tap(Object.assign({ timeout: 8000 }, o)) : await l.click(Object.assign({ timeout: 8000 }, o)); }
    catch (e) { throw new Error('tap ' + sel + ': ' + e.message.split('\n').slice(0, 6).join(' | ')); }
    await p.waitForTimeout(220);
  };
  const store = () => p.evaluate(() => JSON.parse(localStorage.getItem('__mockstore') || '{}'));
  const text = sel => p.locator(sel).first().innerText().catch(() => '');
  return { p, errs, tap, store, text };
}

/* through sign-in and the shortest setup */
async function onboard(pg, values = ['rel', 'body', 'solve']) {
  const { p, tap } = pg;
  await p.goto('http://compass.test/'); await p.waitForTimeout(500);
  if (await p.locator('.lhero [data-act=signin]').count()) { await tap('.lhero [data-act=signin]'); await p.waitForTimeout(600); }
  if (await p.locator('[data-act=obNext]').count()) {
    await tap('[data-act=obNext]'); for (const v of values) await tap(`[data-act=obValue][data-v=${v}]`);
    while (await p.locator('[data-act=obNext]').count()) await tap('[data-act=obNext]');
  }
  await p.waitForTimeout(500);
  await tap('[data-act=introDone]').catch(() => {});
}

function report(name, results) {
  const f = results.filter(r => !r.pass);
  console.log(`${name}: ${results.length - f.length}/${results.length} passed`);
  f.forEach(x => console.log('  FAIL', x.n, JSON.stringify(x.i === undefined ? '' : x.i).slice(0, 500)));
}
const launch = chromium => chromium.launch({ executablePath: process.env.CHROMIUM || undefined, channel: process.env.CHROMIUM ? undefined : 'chromium' });
module.exports = { newCtx, newPage, onboard, report, launch, W, H, touch, dark, S: process.env.S };

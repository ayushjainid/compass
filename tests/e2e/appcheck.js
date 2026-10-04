// App Check starts with the site key from firebase-config.js (app and dashboard); a debug token only on localhost
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../public');
const results = []; const ok = (n, c, i) => results.push({ n, pass: !!c, i: c ? undefined : i });
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, channel: process.env.CHROMIUM ? undefined : 'chromium' });
  const run = async (host, file, key) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort());
    await ctx.route(`http://${host}/**`, async route => { const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type;
      if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; } else if (p === '/firebase-config.js') { body = `window.COMPASS_FIREBASE_CONFIG={apiKey:"t",authDomain:"x",projectId:"x",appId:"x"};window.COMPASS_APPCHECK_SITE_KEY=${JSON.stringify(key)};`; type = 'text/javascript'; } else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
      route.fulfill({ status: 200, body, contentType: type }); });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(`http://${host}/${file}`); await p.waitForTimeout(900);
    const r = await p.evaluate(() => ({ ac: window.__ac || null, debug: self.FIREBASE_APPCHECK_DEBUG_TOKEN === true }));
    await ctx.close(); return Object.assign(r, { errs });
  };
  let r = await run('compass.test', '', '6LtestKey');
  ok('app: App Check starts with the configured key', r.ac === '6LtestKey', r);
  ok('app: no debug token on the real site', !r.debug, r);
  r = await run('compass.test', 'stats.html', '6LtestKey');
  ok('dashboard: App Check starts too', r.ac === '6LtestKey', r);
  r = await run('localhost', '', '6LtestKey');
  ok('localhost: uses a debug token', r.ac === '6LtestKey' && r.debug, r);
  r = await run('compass.test', '', '');
  ok('no key: App Check stays off', r.ac === null, r);
  ok('no page errors', [r.errs].flat().length === 0, r.errs);
  console.log(`appcheck: ${results.filter(x => x.pass).length}/${results.length} passed`); results.filter(x => !x.pass).forEach(x => console.log('  FAIL', x.n, JSON.stringify(x.i || '').slice(0, 300)));
  await b.close(); })();

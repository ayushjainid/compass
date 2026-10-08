// The installed app opens with no connection; online it still gets new versions; a weak connection doesn't block it
const { chromium } = require('./engine'); const fs = require('fs'), path = require('path'), http = require('http');
const root = path.join(__dirname, '../../public'), S = process.env.S;
const results = []; const ok = (n, c, i) => results.push({ n, pass: !!c, i: c ? undefined : i });
let marker = 'v-one', slow = 0;
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost'); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type = 'text/html';
  const send = () => { res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); res.end(body); };
  if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; }
  else if (p === '/firebase-config.js') { body = 'window.COMPASS_FIREBASE_CONFIG={apiKey:"t",authDomain:"x",projectId:"x",appId:"x"}'; type = 'text/javascript'; }
  else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { res.writeHead(404); return res.end(); } type = p.endsWith('.js') ? 'text/javascript' : p.endsWith('.webmanifest') ? 'application/manifest+json' : p.endsWith('.png') ? 'image/png' : 'text/html';
    if (p === '/index.html') body = String(body).replace('<title>', `<meta name="x-build" content="${marker}"><title>`); }
  if (slow && p === '/index.html') setTimeout(send, slow); else send();
});
(async () => {
  await new Promise(r => srv.listen(8765, r));
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, channel: process.env.CHROMIUM ? undefined : 'chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort());
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const tap = async s => { const l = p.locator(s).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.tap(); await p.waitForTimeout(200); };
  const build = () => p.evaluate(() => (document.querySelector('meta[name=x-build]') || {}).content);
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(500); await tap('.lhero [data-act=signin]'); await p.waitForTimeout(600);
  await tap('[data-act=obNext]'); for (const v of ['rel', 'body']) await tap(`[data-act=obValue][data-v=${v}]`);
  while (await p.locator('[data-act=obNext]').count()) await tap('[data-act=obNext]');
  await p.waitForTimeout(800);
  await p.evaluate(() => navigator.serviceWorker.ready);
  ok('service worker installed for everyone (no reminders needed)', await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())));
  const cached = await p.evaluate(async () => (await Promise.all((await caches.keys()).filter(k => k.startsWith('compass-shell-')).map(async k => (await caches.open(k)).keys()))).flat().map(r => new URL(r.url).pathname + new URL(r.url).search));
  ok('the app and its SDK are saved on the device', cached.includes('/') && cached.some(u => /^\/vendor\/firebase\.js\?v=\d+$/.test(u)), cached);
  await tap('.dayrow[data-k=reach]'); await p.waitForTimeout(1200);
  // offline launch
  await p.evaluate(() => localStorage.setItem('__failOffline', '1'));
  await ctx.setOffline(true);
  await p.reload(); await p.waitForTimeout(1500);
  ok('offline: the app opens instead of a browser error', await p.locator('.island').count() === 1 && await p.locator('#tabs [data-act=tab]').count() === 5, await p.content().then(h => h.slice(0, 200)));
  ok('offline: your data is there', /1 done/.test(await p.locator('.donehead').innerText().catch(() => '')));
  ok('offline: header says so', /Offline|Synced|saved/.test(await p.locator('#sync').innerText()));
  await tap('.dayrow[data-k=gym]').catch(() => {}); await tap('[data-act=inc][data-k=gym]').catch(() => {});
  await p.goto('http://localhost:8765/?tab=review'); await p.waitForTimeout(1200);
  ok('offline: opening a reminder link still works', await p.locator('[data-act=tab][data-t=review][aria-selected=true]').count() === 1);
  // the privacy page is not confused with the app
  await ctx.setOffline(false); await p.waitForTimeout(3000);
  const st = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('__mockstore')); const k = Object.keys(s).find(k => /docs\/w-/.test(k)); return s[k]; });
  ok('back online: what you did offline reaches the server', st && st.c && st.c.gym >= 1, st && st.c);
  await p.goto('http://localhost:8765/privacy.html'); await p.waitForTimeout(500);
  ok('other pages are still themselves', /Privacy/i.test(await p.title()) && await p.locator('.island').count() === 0, await p.title());
  // online: a new version arrives
  marker = 'v-two';
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(1500);
  ok('online: you get the newest version straight away', await build() === 'v-two', await build());
  // weak connection: don't hang on a blank screen
  slow = 9000; marker = 'v-three';
  const t0 = Date.now(); await p.goto('http://localhost:8765/', { waitUntil: 'domcontentloaded', timeout: 20000 }); const ms = Date.now() - t0;
  ok('very slow connection: the saved copy opens within ~4 s', ms < 6000 && await build() === 'v-two', { ms, b: await build() });
  slow = 0; await p.waitForTimeout(6000);
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(800);
  ok('…and the next open has the newer version', await build() === 'v-three', await build());
  ok('no page errors', errs.length === 0, errs);
  const f = results.filter(r => !r.pass); console.log(`offline: ${results.length - f.length}/${results.length} passed`); f.forEach(x => console.log('  FAIL', x.n, JSON.stringify(x.i || '').slice(0, 300)));
  await b.close(); srv.close(); process.exit(0);
})().catch(e => { console.log('CRASH', e.message.split('\n')[0]); results.filter(r => !r.pass).forEach(x => console.log('  FAIL', x.n, JSON.stringify(x.i || '').slice(0, 300))); process.exit(1); });

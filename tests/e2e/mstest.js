const { chromium, NAME } = require('./engine');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '../../public'), S = process.env.S;
const results = []; const ok = (name, cond, info) => results.push({ name, pass: !!cond, info: cond ? undefined : info });
/* the sample data was recorded around 1 Oct 2026; move every date forward by however long ago that was,
   so "done about 1.8× a week over recent weeks" stays true whenever the tests run */
const FX_REF = Date.UTC(2026, 9, 1), SHIFT = 7 * Math.max(0, Math.floor((Date.now() - FX_REF) / (7 * 864e5)));   // whole weeks, so weekdays stay put
const shiftIso = t => t.replace(/(\d{4})-(\d{2})-(\d{2})(?=T|")/g, (m, y, mo, d) => new Date(Date.UTC(+y, +mo - 1, +d) + SHIFT * 864e5).toISOString().slice(0, 10));
const shiftUs = t => t.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (m, mo, d, y) => { const x = new Date(Date.UTC(+y, +mo - 1, +d) + SHIFT * 864e5); return `${x.getUTCMonth() + 1}/${x.getUTCDate()}/${x.getUTCFullYear()}`; });
const FX = JSON.parse(shiftIso(fs.readFileSync(path.join(__dirname, 'fixtures/') + 'mstodo-graph.json', 'utf8')));
const CSV_DIR = fs.mkdtempSync(path.join(require('os').tmpdir(), 'fx-')), CSV_FILE = path.join(CSV_DIR, 'Outlook-Tasks.CSV');
fs.writeFileSync(CSV_FILE, shiftUs(fs.readFileSync(path.join(__dirname, 'fixtures', 'Outlook-Tasks.CSV'), 'utf8')));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, channel: process.env.CHROMIUM ? undefined : 'chromium', args: ['--ignore-certificate-errors'] });
  const run = async (mode) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: mode !== 'desktop', isMobile: mode !== 'desktop' });
    const seen = { challenge: null, verifierOk: null, redirect: null, scope: null, pages: 0, auth: 0, token: 0, body: null };
    await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort()); await ctx.route('https://compass.test/**', async route => {
      const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type;
      if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; }
      else if (p === '/firebase-config.js') { body = 'window.COMPASS_FIREBASE_CONFIG={apiKey:"test",authDomain:"x",projectId:"x",appId:"x"};window.COMPASS_MS_CLIENT_ID="test-client-id";'; type = 'text/javascript'; }
      else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
      route.fulfill({ status: 200, body, contentType: type });
    });
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
    await ctx.route('https://login.microsoftonline.com/**', async route => {
      const req = route.request(), u = new URL(req.url());
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (u.pathname.endsWith('/authorize')) {
        seen.auth++; seen.challenge = u.searchParams.get('code_challenge'); seen.redirect = u.searchParams.get('redirect_uri'); seen.scope = u.searchParams.get('scope');
        const back = new URL(seen.redirect);
        if (mode === 'cancel') { back.searchParams.set('error', 'access_denied'); back.searchParams.set('error_description', 'The user cancelled the sign-in'); }
        else { back.searchParams.set('code', 'one-time-code'); }
        back.searchParams.set('state', u.searchParams.get('state'));
        /* Microsoft's own sign-in page sends the browser back; a page that does that works in every engine (WebKit can't fake a 302) */
        return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><title>Sign in</title><script>location.replace(${JSON.stringify(back.toString())})</script>` });
      }
      if (u.pathname.endsWith('/token')) {
        seen.token++; seen.body = (req.postData() || '').slice(0, 80); const f = new URLSearchParams(req.postData() || '');
        const ch = crypto.createHash('sha256').update(f.get('code_verifier') || '').digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        seen.verifierOk = ch === seen.challenge && f.get('code') === 'one-time-code' && f.get('redirect_uri') === seen.redirect && f.get('client_id') === 'test-client-id';
        return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(seen.verifierOk ? { access_token: 'tok-123', token_type: 'Bearer' } : { error: 'invalid_grant', error_description: 'PKCE mismatch' }) });
      }
      route.fulfill({ status: 404, headers: cors, body: '' });
    });
    await ctx.route('https://graph.microsoft.com/**', async route => {
      const req = route.request(), u = new URL(req.url());
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (req.headers()['authorization'] !== 'Bearer tok-123') return route.fulfill({ status: 401, headers: cors, body: '{}' });
      const lists = FX.lists.map((L, i) => ({ id: 'L' + i + '/x=', displayName: L.displayName, wellknownListName: L.wellknownListName }));
      if (/\/me\/todo\/lists$/.test(u.pathname)) return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ value: lists }) });
      const m = u.pathname.match(/\/me\/todo\/lists\/([^/]+)\/tasks$/);
      if (m) {
        const id = decodeURIComponent(m[1]), L = FX.lists[+id.slice(1, id.indexOf('/'))];
        const skip = +(u.searchParams.get('$skip') || 0), size = 20; seen.pages++;
        const page = L.tasks.slice(skip, skip + size), next = skip + size < L.tasks.length ? `https://graph.microsoft.com/v1.0/me/todo/lists/${encodeURIComponent(id)}/tasks?$top=100&$skip=${skip + size}` : undefined;
        return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(Object.assign({ value: page }, next ? { '@odata.nextLink': next } : {})) });
      }
      route.fulfill({ status: 404, headers: cors, body: '{}' });
    });
    if (mode === 'blocked') await ctx.addInitScript(() => { window.open = () => null; });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    const tap = async sel => { const l = p.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); return mode === 'desktop' ? l.click() : l.tap(); };
    await p.goto('https://compass.test/'); await p.waitForTimeout(500);
    await tap('.lhero [data-act=signin]'); await p.waitForTimeout(600);
    ok(`[${mode}] welcome mentions Microsoft To Do`, /Microsoft To Do/.test(await p.locator('.impcard').first().innerText()));
    await tap('[data-act=impOpen]'); await p.waitForTimeout(250);
    ok(`[${mode}] Connect card shows`, await p.locator('[data-act=msConnect]').count() === 1);
    if (mode === 'desktop') {
      const [pop] = await Promise.all([ctx.waitForEvent('page'), tap('[data-act=msConnect]')]);
      await pop.waitForEvent('close', { timeout: 8000 }).catch(() => {});
      ok(`[${mode}] popup closes itself after sign-in`, pop.isClosed(), { url: pop.isClosed() ? '' : pop.url(), auth: seen.auth });
    } else {
      await tap('[data-act=msConnect]');
    }
    await p.waitForFunction(() => /Microsoft To Do/.test((document.querySelector('.card .task .tx') || {}).textContent || '') || /Microsoft said|cancelled|expired|Couldn/.test(document.body.textContent), null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(400);
    if (mode === 'cancel') {
      ok(`[${mode}] cancelled sign-in explains itself`, /cancelled the sign-in/i.test(await p.locator('.imperr').innerText().catch(() => '')), await p.locator('#main').innerText());
      ok(`[${mode}] still on the import screen`, await p.locator('#impDrop').count() === 1);
    } else {
      const row = await p.locator('.card .task').first().innerText().catch(() => '');
      ok(`[${mode}] redirect_uri is the ms-auth page`, seen.redirect === 'https://compass.test/ms-auth.html', seen.redirect);
      ok(`[${mode}] asks only for Tasks.Read`, seen.scope === 'Tasks.Read', seen.scope);
      ok(`[${mode}] PKCE verifier matches the challenge`, seen.verifierOk === true, { seen, err: await p.locator('.imperr').innerText().catch(() => ''), busy: await p.locator('#main').innerText().then(t => t.slice(0, 200)).catch(() => '') });
      ok(`[${mode}] reads every page of every list`, seen.pages >= 5, seen.pages);
      ok(`[${mode}] lists come in as one source`, /Microsoft To Do/.test(row) && /72 items/.test(row), row);
      ok(`[${mode}] Connect turns into Refresh`, /Refresh/.test(await p.locator('[data-act=msConnect]').innerText()));
      ok(`[${mode}] nothing about the token is left in storage`, await p.evaluate(() => !Object.keys(localStorage).concat(Object.keys(sessionStorage)).some(k => /ms-(flow|auth)/.test(k))));
      await p.screenshot({ path: `${S}/ms-pick-${mode}.png` });
      await tap('[data-act=impRun]'); await p.waitForTimeout(600);
      const txt = await p.locator('#main').innerText();
      ok(`[${mode}] review finds Morning run with its days and time`, /Morning run/.test(txt) && /Tue, Thu, Sat/.test(txt) && /6:30 am/.test(txt), txt.slice(0, 400));
      ok(`[${mode}] review floors Morning run at what you really do`, /done about 1\.[6-9]/.test(txt));
      ok(`[${mode}] flagged emails left out`, !/invoice/i.test(txt));
      await p.screenshot({ path: `${S}/ms-review-${mode}.png`, fullPage: true });
      await tap('[data-act=impUse]'); await p.waitForTimeout(400);
      if (await p.locator('[data-act=impGoal]').count()) await tap('[data-act=impGoal]'); else await p.fill('#ob-goal', 'Keep growing steadily');
      await p.waitForTimeout(150);
      for (let i = 0; i < 2; i++) { await tap('[data-act=obNext]'); await p.waitForTimeout(150); }
      ok(`[${mode}] setup rows are tagged Microsoft To Do`, await p.locator('.obrow .tag.imp', { hasText: 'Microsoft To Do' }).count() >= 3);
    }
    ok(`[${mode}] no page errors`, errs.length === 0, errs);
    await ctx.close();
  };
  /* Playwright's WebKit lets the token request slip past the fake Microsoft (it reached the real one in CI), so on
     WebKit only the cancel path and the CSV run here; the full sign-in is checked on Chromium and Firefox */
  for (const m of NAME === 'webkit' ? ['cancel'] : ['desktop', 'blocked', 'cancel']) await run(m);
  /* Outlook CSV through the file picker (plain http like the other suites: nothing here needs a secure page) */
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort()); await ctx.route('http://compass.test/**', async route => {
      const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type;
      if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; }
      else if (p === '/firebase-config.js') { body = 'window.COMPASS_FIREBASE_CONFIG={apiKey:"test",authDomain:"x",projectId:"x",appId:"x"};'; type = 'text/javascript'; }
      else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
      route.fulfill({ status: 200, body, contentType: type });
    });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://compass.test/'); await p.waitForTimeout(500); await p.click('.lhero [data-act=signin]'); await p.waitForTimeout(600);
    await p.click('[data-act=impOpen]'); await p.waitForTimeout(200);
    ok('[csv] no Connect button without a client ID', await p.locator('[data-act=msConnect]').count() === 0);
    await p.click('summary:has-text("How to export")');
    { const h = await p.locator('details.fold:has-text("How to export")').innerText(); ok('[csv] export help covers Microsoft To Do via Outlook', /Microsoft To Do/i.test(h) && /Outlook/.test(h), h.slice(0, 300)); }
    await p.setInputFiles('#impFiles', CSV_FILE); await p.waitForTimeout(600);
    { const row = await p.locator('.card .task').first().innerText({ timeout: 5000 }).catch(() => '');
      ok('[csv] Outlook CSV is recognised as Microsoft To Do', /Microsoft To Do · 24 items/.test(row), row || { err: await p.locator('.imperr').innerText().catch(() => ''), main: (await p.locator('#main').innerText()).slice(-300), errs }); }
    await p.click('[data-act=impRun]'); await p.waitForTimeout(500);
    const t = await p.locator('#main').innerText();
    ok('[csv] Guitar practice found with Mon/Thu 8 pm', /Guitar practice/.test(t) && /Mon, Thu/.test(t) && /8 pm/.test(t), t.slice(0, 500));
    ok('[csv] no page errors', errs.length === 0, errs);
    await ctx.close();
  }
  const fails = results.filter(r => !r.pass);
  console.log(`${results.length - fails.length}/${results.length} passed`);
  fails.forEach(f => console.log('  FAIL', f.name, JSON.stringify(f.info || '').slice(0, 400)));
  await b.close();
})().catch(e => { console.log('CRASH', e.message.split('\n').slice(0, 3).join(' | ')); results.filter(r => !r.pass).forEach(f => console.log('  FAIL', f.name, JSON.stringify(f.info || '').slice(0, 300))); console.log('passed so far', results.filter(r => r.pass).length); process.exit(1); });

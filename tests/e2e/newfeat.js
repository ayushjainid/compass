// Plan budget by picked days, pause/resume, update prompt + stale guard, usage tallies
const { chromium } = require('./engine'); const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../public'), S = process.env.S;
const W = +(process.env.W || 390), H = +(process.env.H || 844), touch = process.env.T !== '0', dark = process.env.D === '1';
const results = []; const ok = (n, c, i) => results.push({ n, pass: !!c, i: c ? undefined : i });
let VERSION = null;   // what /version.json returns
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, channel: process.env.CHROMIUM ? undefined : 'chromium' });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, colorScheme: dark ? 'dark' : 'light', deviceScaleFactor: 2 });
  await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort()); await ctx.route('http://compass.test/**', async route => { const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type;
    if (u.pathname === '/index.html' && VERSION) { let h = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace('const DATA_V = 1;', `const DATA_V = ${VERSION.min}; /* ${VERSION.build} */`); return route.fulfill({ status: 200, body: h, contentType: 'text/html' }); }
    if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; } else if (p === '/firebase-config.js') { body = 'window.COMPASS_FIREBASE_CONFIG={apiKey:"t",authDomain:"x",projectId:"x",appId:"x"}'; type = 'text/javascript'; } else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
    route.fulfill({ status: 200, body, contentType: type }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const tap = async s => { const l = typeof s === 'string' ? p.locator(s).first() : s; await l.scrollIntoViewIfNeeded().catch(()=>{}); touch ? await l.tap() : await l.click(); await p.waitForTimeout(200); };
  const store = () => p.evaluate(() => JSON.parse(localStorage.getItem('__mockstore')));
  const setComp = (id, fn) => p.evaluate(([id, fn]) => { const st = JSON.parse(localStorage.getItem('__mockstore')); const pr = st['users/u1/docs/profile']; let c = pr.components.find(c => c.id === id); if (!c) { c = { id }; pr.components.push(c); } new Function('c', fn)(c); localStorage.setItem('__mockstore', JSON.stringify(st)); }, [id, fn]);
  await p.goto('http://compass.test/'); await p.waitForTimeout(500); await tap('.lhero [data-act=signin]'); await p.waitForTimeout(600);
  // ---- usage: setup start
  let st = await store();
  ok('stats: starting setup adds obStart to today and this week', Object.keys(st).some(k => /^stats\/d-/.test(k) && st[k].obStart === 1) && Object.keys(st).some(k => /^stats\/w-/.test(k) && st[k].obStart === 1), Object.keys(st).filter(k => k.startsWith('stats')));
  await tap('[data-act=obNext]'); for (const v of ['rel', 'body', 'mind']) await tap(`[data-act=obValue][data-v=${v}]`); await tap('[data-act=obCore][data-v=body]');
  while (await p.locator('[data-act=obNext]').count()) await tap('[data-act=obNext]');
  await p.waitForTimeout(1200);
  st = await store();
  const dk = Object.keys(st).find(k => /^stats\/d-/.test(k)), wk = Object.keys(st).find(k => /^stats\/w-/.test(k));
  ok('stats: finishing setup counts obDone + active, with account age a0', st[dk].obDone === 1 && st[dk].active === 1 && st[wk].a0 === 1, [st[dk], st[wk]]);
  ok('stats docs hold only numbers', [st[dk], st[wk]].every(o => Object.values(o).every(v => typeof v === 'number')));
  // ticking twice in a day counts once
  await tap('.daylist .dayrow'); await p.waitForTimeout(400); await tap('.daylist .dayrow'); await p.waitForTimeout(600);
  st = await store();
  ok('stats: logging counts once per day however many ticks', st[dk].logged === 1 && st[wk].logged === 1, st[dk]);
  await p.reload(); await p.waitForTimeout(1500);
  st = await store();
  ok('stats: reopening the same day does not count again', st[dk].active === 1, st[dk]);
  // ---- plan budget: a 2-hour daily habit on Monday only
  const leftNums = async () => { await tap('[data-act=tab][data-t=week]'); await tap('[data-act=weekView][data-v=plan]'); await p.waitForTimeout(300); const t = await p.locator('.pleft').allInnerTexts(); await tap('[data-act=tab][data-t=today]'); return t; };
  await setComp('dhab', 'Object.assign(c,{value:"body",name:"Long run",cadence:"daily",target:1,hours:2})');
  await p.reload(); await p.waitForTimeout(1500);
  const before = await leftNums();
  await setComp('dhab', 'c.block={days:[0],time:"06:00",dur:120}');
  await p.reload(); await p.waitForTimeout(1500);
  const after = await leftNums();
  const mins = s => { const h = /(\d+(?:\.\d+)?)\s*h/.exec(s), m = /(\d+)\s*m/.exec(s); let v = (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0); if (/over/i.test(s)) v = -v; return v; };
  ok('plan: picked-day habit takes its full time on Monday', mins(after[0]) < mins(before[0]) - 60, [before, after]);
  ok('plan: …and frees the other days', mins(after[1]) > mins(before[1]), [before, after]);
  // ---- pause
  await tap('[data-act=tab][data-t=compass]'); await tap('[data-act=cSec][data-k=values]');
  const gymName = 'Long run';
  await tap(`[data-act=editComp]:has-text("${gymName}")`); await p.waitForTimeout(300);
  ok('pause: sheet offers Pause', await p.locator('[data-act=pauseComp]').count() === 1);
  await p.screenshot({ path: `${S}/nf-pauserow-${W}${dark ? 'd' : ''}.png` });
  await tap('[data-act=pauseComp]'); await p.waitForTimeout(500);
  st = await store(); let c = st['users/u1/docs/profile'].components.find(c => c.id === 'dhab');
  const mon = await p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  ok('pause: saved with this Monday', c.paused === mon, c);
  if (!(await p.locator(`[data-act=editComp]:has-text("${gymName}")`).count())) await tap('[data-act=cSec][data-k=values]');
  await p.screenshot({ path: `${S}/nf-pausedlist-${W}${dark ? 'd' : ''}.png` });
  ok('pause: shows a Paused tag in Compass', /Paused/i.test(await p.locator(`[data-act=editComp]:has-text("${gymName}")`).innerText()), await p.locator('[data-act=cSec]').allInnerTexts());
  ok('stats: pausing counted', (await store())[dk].paused === 1);
  await tap('[data-act=tab][data-t=today]');
  // Monday view: switch to Monday in the strip
  const keys = await p.locator('[data-act=day]').evaluateAll(es => es.map(e => e.dataset.k)); await tap(`[data-act=day][data-k="${keys[0]}"]`);
  ok('pause: gone from Today (even on its day)', await p.locator('.dayrow[data-k=dhab]').count() === 0);
  await tap('[data-act=tab][data-t=week]'); await tap('[data-act=weekView][data-v=plan]'); await p.waitForTimeout(300);
  const afterPause = await p.locator('.pleft').allInnerTexts();
  ok('pause: plan budget no longer counts it', mins(afterPause[0]) > mins(after[0]), [after[0], afterPause[0]]);
  await tap('[data-act=tab][data-t=compass]');
  if (!(await p.locator(`[data-act=editComp]:has-text("${gymName}")`).count())) await tap('[data-act=cSec][data-k=values]');
  await tap(`[data-act=editComp]:has-text("${gymName}")`); await p.waitForTimeout(300);
  ok('pause: sheet shows paused note with Resume, no Pause row', await p.locator('.pausenote [data-act=resumeComp]').count() === 1 && await p.locator('[data-act=pauseComp]').count() === 0);
  await p.screenshot({ path: `${S}/nf-paused-${W}${dark ? 'd' : ''}.png` });
  await tap('[data-act=resumeComp]'); await p.waitForTimeout(500);
  st = await store(); c = st['users/u1/docs/profile'].components.find(c => c.id === 'dhab');
  ok('resume: same-week pause leaves no history span', !c.paused && !(c.pauses || []).length, c);
  // a past pause keeps history: paused 3 weeks ago, resumed now → span recorded; that week isn't counted
  await setComp('dhab', 'const d=new Date();d.setDate(d.getDate()-((d.getDay()+6)%7)-21);c.paused=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")');
  await p.reload(); await p.waitForTimeout(1500);
  await tap('[data-act=tab][data-t=compass]'); if (!(await p.locator(`[data-act=editComp]:has-text("${gymName}")`).count())) await tap('[data-act=cSec][data-k=values]');
  await tap(`[data-act=editComp]:has-text("${gymName}")`); await tap('[data-act=resumeComp]'); await p.waitForTimeout(500);
  st = await store(); c = st['users/u1/docs/profile'].components.find(c => c.id === 'dhab');
  ok('resume: older pause is kept as a { from, to } span', !c.paused && c.pauses && c.pauses.length === 1 && c.pauses[0].to === mon && !Array.isArray(c.pauses[0]), c);
  await tap('[data-act=tab][data-t=today]'); await tap(`[data-act=day][data-k="${keys[0]}"]`);
  ok('resume: back on Today', await p.locator('.dayrow[data-k=dhab]').count() === 1);
  // a device still holding the old [from, to] pairs converts them and syncs again
  await setComp('dhab', 'c.pauses=[["2026-08-03","2026-08-17"]]');
  await p.evaluate(() => Object.keys(localStorage).filter(k => /profile$/.test(k) && k !== '__mockstore').forEach(k => localStorage.removeItem(k)));   // this device knows only what the server has
  await p.reload(); await p.waitForTimeout(2500);
  st = await store(); c = st['users/u1/docs/profile'].components.find(c => c.id === 'dhab');
  ok('old pause pairs are converted to { from, to } and saved', c.pauses.length === 1 && !Array.isArray(c.pauses[0]) && c.pauses[0].from === '2026-08-03' && c.pauses[0].to === '2026-08-17', c.pauses);
  ok('nothing refused by the database afterwards', !(await p.evaluate(() => window.__nestedRefused)), await p.evaluate(() => window.__nestedRefused));
  // ---- update prompt
  VERSION = { build: 'newer123', min: 1 };
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); });
  await p.reload(); await p.waitForTimeout(4200);
  const dbg = await p.evaluate(async () => { const r = await fetch('/index.html', { cache: 'no-store' }); const t = await r.text(); return [r.status, t.includes('newer123'), document.querySelector('script[type="module"]').textContent.includes('newer123')]; });
  ok('update: bar appears when a newer build is out', await p.locator('#updbar').count() === 1 && /newer version/i.test(await p.locator('#updbar').innerText()), dbg);
  await p.screenshot({ path: `${S}/nf-upd-${W}${dark ? 'd' : ''}.png` });
  await tap('#updbar [data-act=updLater]');
  ok('update: Later hides it', await p.locator('#updbar').count() === 0);
  // stale data version: stop saving
  VERSION = { build: 'newer123', min: 2 };
  await p.reload(); await p.waitForTimeout(4200);
  ok('stale: bar asks to refresh to keep saving', /keep saving/i.test(await p.locator('#updbar').innerText().catch(() => '')));
  const tx0 = await p.evaluate(() => window.__tx || 0);
  const w0 = JSON.stringify(Object.entries(await store()).filter(([k]) => /docs\/w-/.test(k)));
  await tap('[data-act=tab][data-t=today]');
  const di = await p.evaluate(() => (new Date().getDay() + 6) % 7); await p.locator(`[data-act=day][data-k="${keys[di]}"]`).dispatchEvent('click'); await p.waitForTimeout(300);
  const rowsN = await p.locator('.daylist .dayrow').count(); if (!rowsN) await p.screenshot({ path: `${S}/nf-dbg.png`, fullPage: true });
  if (!(await p.locator('.daylist .dayrow').count())) { await p.locator('[data-act=doneFold]').dispatchEvent('click'); await p.waitForTimeout(300); }
  await p.locator('.daylist .dayrow, .donelist .dayrow').first().dispatchEvent('click'); await p.waitForTimeout(1500);
  const w1 = JSON.stringify(Object.entries(await store()).filter(([k]) => /docs\/w-/.test(k)));
  ok('stale: a tick is not sent to the server', w0 === w1 && (await p.evaluate(() => window.__tx || 0)) === tx0);
  ok('stale: sync line says reload', /reload/i.test(await p.locator('#sync').innerText()));
  const localHas = await p.evaluate(sv => Object.keys(localStorage).filter(k => /w-\d/.test(k) && !/^(base|pend):/.test(k)).some(k => !sv.includes(localStorage.getItem(k).slice(20, 120))), w1);
  ok('stale: the tick is kept on this device', localHas);
  VERSION = null;   // reloaded onto the current code
  await p.locator('#updbar [data-act=reloadApp]').dispatchEvent('click'); await p.waitForTimeout(3000);
  const w2 = JSON.stringify(Object.entries(await store()).filter(([k]) => /docs\/w-/.test(k)));
  ok('after refresh the kept tick syncs', w2 !== w1, [w1.slice(0, 200), w2.slice(0, 200)]);
  ok('after refresh no bar', await p.locator('#updbar').count() === 0);
  ok('no page errors', !errs.length, errs);
  console.log(`newfeat ${W}${dark ? 'd' : ''}: ${results.filter(x => x.pass).length}/${results.length} passed`); results.filter(x => !x.pass).forEach(x => console.log('  FAIL', x.n, JSON.stringify(x.i || '').slice(0, 400)));
  await b.close(); })();

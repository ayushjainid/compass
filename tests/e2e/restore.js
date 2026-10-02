// Backup → change things → restore: the backup comes back; bad files are refused; cancel changes nothing
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../public'), S = process.env.S;
const W = +(process.env.W || 390), H = +(process.env.H || 844), touch = process.env.T !== '0';
const results = []; const ok = (n, c, i) => results.push({ n, pass: !!c, i: c ? undefined : i });
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, channel: process.env.CHROMIUM ? undefined : 'chromium' });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, acceptDownloads: true, colorScheme: 'dark', deviceScaleFactor: 2 });
  await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort()); await ctx.route('http://compass.test/**', async route => { const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type;
    if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; } else if (p === '/firebase-config.js') { body = 'window.COMPASS_FIREBASE_CONFIG={apiKey:"t",authDomain:"x",projectId:"x",appId:"x"}'; type = 'text/javascript'; } else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
    route.fulfill({ status: 200, body, contentType: type }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const tap = async s => { const l = p.locator(s).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); touch ? await l.tap() : await l.click(); await p.waitForTimeout(250); };
  const store = () => p.evaluate(() => JSON.parse(localStorage.getItem('__mockstore') || '{}'));
  await p.goto('http://compass.test/'); await p.waitForTimeout(500); await tap('.lhero [data-act=signin]'); await p.waitForTimeout(600);
  await tap('[data-act=obNext]'); await p.fill('#ob-goal', 'Original goal'); for (const v of ['rel', 'body']) await tap(`[data-act=obValue][data-v=${v}]`);
  while (await p.locator('[data-act=obNext]').count()) await tap('[data-act=obNext]');
  await p.waitForTimeout(600);
  await tap('[data-act=introDone]').catch(() => {});
  await tap('.dayrow[data-k=reach]'); await p.fill('#j-win', 'Backed-up win'); await p.evaluate(() => document.activeElement.blur()); await p.waitForTimeout(1200);
  // download a backup
  await tap('[data-act=tab][data-t=compass]'); await tap('[data-act=cSec][data-k=app]');
  const [dl] = await Promise.all([p.waitForEvent('download'), tap('[data-act=export]')]);
  const file = path.join(S, 'backup-test.json'); await dl.saveAs(file);
  const bk = JSON.parse(fs.readFileSync(file, 'utf8'));
  ok('backup file has setup and this week', bk.app === 'compass' && bk.docs.profile && Object.keys(bk.docs).some(k => k.startsWith('w-')));
  // change things after the backup
  await tap('[data-act=cSec][data-k=goal]'); await p.fill('#p-goal', 'Changed goal'); await p.evaluate(() => document.activeElement.blur());
  await tap('[data-act=tab][data-t=today]'); await tap('[data-act=doneFold]'); await tap('.donelist .dayrow[data-k=reach]'); await p.fill('#j-win', 'Overwritten'); await p.evaluate(() => document.activeElement.blur()); await p.waitForTimeout(1200);
  ok('changes saved before restoring', (await store())['users/u1/docs/profile'].goal === 'Changed goal');
  // a wrong file is refused
  await tap('[data-act=tab][data-t=compass]'); if (!(await p.locator('#restoreFile').count())) await tap('[data-act=cSec][data-k=app]');
  const bad = path.join(S, 'not-a-backup.json'); fs.writeFileSync(bad, JSON.stringify({ hello: 'world' }));
  await p.setInputFiles('#restoreFile', bad); await p.waitForTimeout(300);
  ok('a non-Compass file is refused with a clear message', /isn't a Compass backup/.test(await p.locator('.sheet').innerText()));
  await tap('.sheet [data-act=closeSheet] >> nth=1').catch(async () => tap('.sheet .btn[data-act=closeSheet]'));
  const junk = path.join(S, 'junk.json'); fs.writeFileSync(junk, '{not json');
  await p.setInputFiles('#restoreFile', junk); await p.waitForTimeout(300);
  ok('a broken file is refused too', /isn't a Compass backup/.test(await p.locator('.sheet').innerText()));
  await tap('.sheet .btn[data-act=closeSheet]');
  // the real file: preview, then cancel
  await p.setInputFiles('#restoreFile', file); await p.waitForTimeout(300);
  const prev = await p.locator('.sheet').innerText();
  ok('preview names the file, its date and what it holds, before anything changes', /Restore this backup\?/.test(prev) && /backup-test\.json/.test(prev) && /1 week/.test(prev) && /values, floors/.test(prev) && (await store())['users/u1/docs/profile'].goal === 'Changed goal', prev);
  await p.screenshot({ path: `${S}/restore-${W}.png` });
  await tap('.sheet .btn[data-act=closeSheet]'); await p.waitForTimeout(800);
  ok('Cancel changes nothing', (await store())['users/u1/docs/profile'].goal === 'Changed goal');
  // restore
  await p.setInputFiles('#restoreFile', file); await p.waitForTimeout(300);
  await tap('[data-act=restoreYes]'); await p.waitForTimeout(1500);
  const st = await store(), wk = Object.keys(st).find(k => /docs\/w-/.test(k));
  const day = Object.values(st[wk].days || {})[0] || {};
  ok('restore brings the goal back', st['users/u1/docs/profile'].goal === 'Original goal', st['users/u1/docs/profile'].goal);
  ok('…and the week as it was (tick and journal)', day.a && day.a.reach === true && day.j && day.j.win === 'Backed-up win', day);
  await tap('[data-act=tab][data-t=today]');
  ok('…and the screen shows it', /1 done/.test(await p.locator('.donehead').innerText().catch(() => '')) && await p.inputValue('#j-win') === 'Backed-up win');
  await p.reload(); await p.waitForTimeout(1500);
  ok('…and it sticks after a reload', await p.inputValue('#j-win') === 'Backed-up win');
  ok('no page errors', errs.length === 0, errs);
  const f = results.filter(r => !r.pass); console.log(`restore ${W}: ${results.length - f.length}/${results.length} passed`); f.forEach(x => console.log('  FAIL', x.n, JSON.stringify(x.i || '').slice(0, 300)));
  await b.close(); })().catch(e => { console.log('CRASH', e.message.split('\n')[0]); results.filter(r => !r.pass).forEach(x => console.log('  FAIL', x.n)); process.exit(1); });

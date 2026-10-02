// Send feedback + private error log, and both removed with the account
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../public'), S = process.env.S;
const W = +(process.env.W || 390), H = +(process.env.H || 844), touch = process.env.T !== '0';
const results = []; const ok = (n, c, i) => results.push({ n, pass: !!c, i: c ? undefined : i });
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, colorScheme: 'dark', deviceScaleFactor: 2 });
  await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort()); await ctx.route('http://compass.test/**', async route => { const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type;
    if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; } else if (p === '/firebase-config.js') { body = 'window.COMPASS_FIREBASE_CONFIG={apiKey:"t",authDomain:"x",projectId:"x",appId:"x"}'; type = 'text/javascript'; } else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
    route.fulfill({ status: 200, body, contentType: type }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const tap = async s => { const l = p.locator(s).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); touch ? await l.tap() : await l.click(); await p.waitForTimeout(250); };
  const store = () => p.evaluate(() => JSON.parse(localStorage.getItem('__mockstore') || '{}'));
  await p.goto('http://compass.test/'); await p.waitForTimeout(500); await tap('.lhero [data-act=signin]'); await p.waitForTimeout(600);
  await tap('[data-act=obNext]'); for (const v of ['rel', 'body']) await tap(`[data-act=obValue][data-v=${v}]`);
  while (await p.locator('[data-act=obNext]').count()) await tap('[data-act=obNext]');
  await p.waitForTimeout(600);
  await tap('[data-act=tab][data-t=compass]'); await tap('[data-act=cSec][data-k=app]'); await tap('[data-act=fbOpen]');
  ok('feedback sheet opens with Send disabled until you type', await p.locator('#fb-text').count() === 1 && await p.locator('[data-act=fbSend]').isDisabled());
  await p.locator('#fb-text').fill('The plan screen is lovely but drag is slow on my Pixel.');
  { const n = await p.locator('#fb-text').inputValue(); ok('typing enables Send and counts characters', !(await p.locator('[data-act=fbSend]').isDisabled()) && (await p.locator('.sheet').innerText()).includes(n.length + '/2000'), await p.locator('.sheet').innerText()); }
  await p.screenshot({ path: `${S}/feedback-${W}.png` });
  await tap('[data-act=fbSend]'); await p.waitForTimeout(400);
  let st = await store(); const fk = Object.keys(st).filter(k => k.startsWith('feedback/u1-'));
  ok('feedback saved with your note, browser and screen, nothing else', fk.length === 1 && st[fk[0]].text.startsWith('The plan screen') && st[fk[0]].uid === 'u1' && st[fk[0]].ua && st[fk[0]].screen === 'compass' && Object.keys(st[fk[0]]).sort().join() === 'at,screen,text,ua,uid', st[fk[0]]);
  ok('thank-you shows', /Thank you/.test(await p.locator('.sheet').innerText()));
  await tap('.sheet [data-act=closeSheet] >> nth=1').catch(() => tap('.sheet .btn[data-act=closeSheet]'));
  // errors
  for (let i = 0; i < 3; i++) await p.evaluate(() => setTimeout(() => { throw new Error('Boom in test'); }, 0));
  await p.evaluate(() => { Promise.reject(new Error('Rejected in test')); });
  await p.waitForTimeout(500);
  st = await store();
  const items = (st['errors/u1'] || {}).items || [];
  ok('errors are logged once each (deduped)', items.filter(x => /Boom in test/.test(x.msg)).length === 1 && items.some(x => /Rejected in test/.test(x.msg)), items);
  for (let i = 0; i < 8; i++) await p.evaluate(i => setTimeout(() => { throw new Error('Different ' + i); }, 0), i);
  await p.waitForTimeout(500); st = await store();
  ok('at most 5 new errors a day from one device', ((st['errors/u1'] || {}).items || []).length === 5, ((st['errors/u1'] || {}).items || []).map(x => x.msg));
  ok('error entries carry no app data', ((st['errors/u1'] || {}).items || []).every(x => Object.keys(x).sort().join() === 'at,msg,tab,ua,where'));
  errs.length = 0; // the thrown test errors themselves
  // delete account cleans both
  await tap('#acctBtn'); await tap('[data-act=delAcct]'); await tap('[data-act=delAcctYes]');
  await p.waitForFunction(() => !localStorage.getItem('__mockuser'), null, { timeout: 15000 }).catch(() => {});
  st = await store();
  ok('deleting your account removes your feedback and error log', !Object.keys(st).some(k => k.startsWith('feedback/u1-') || k === 'errors/u1'), Object.keys(st));
  ok('no page errors', errs.filter(e => !/Boom|Rejected|Different/.test(e)).length === 0, errs);
  const f = results.filter(r => !r.pass); console.log(`feedback ${W}: ${results.length - f.length}/${results.length} passed`); f.forEach(x => console.log('  FAIL', x.n, JSON.stringify(x.i || '').slice(0, 400)));
  await b.close(); })().catch(e => { console.log('CRASH', e.message.split('\n')[0]); results.filter(r => !r.pass).forEach(x => console.log('  FAIL', x.n)); process.exit(1); });

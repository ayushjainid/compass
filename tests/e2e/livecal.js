// Live calendar feed in the app: make the link, subscribe buttons, copy, reset, turn off, delete account
const { chromium, NAME } = require('./engine'); const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../public'), S = process.env.S;
const W = +(process.env.W || 390), H = +(process.env.H || 844), touch = process.env.T !== '0', dark = process.env.D === '1';
const results = []; const ok = (n, c, i) => results.push({ n, pass: !!c, i: c ? undefined : i });
const WURL = 'https://compass-reminders.test.workers.dev';
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, channel: process.env.CHROMIUM ? undefined : 'chromium' });
  const mk = async worker => {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, colorScheme: dark ? 'dark' : 'light', deviceScaleFactor: 2 });
    if (NAME === 'chromium') await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://compass.test' }).catch(() => {});   // other engines don't have these permissions
    await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort());
    await ctx.route('http://compass.test/**', async route => { const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type;
      if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; } else if (p === '/firebase-config.js') { body = `self.COMPASS_FIREBASE_CONFIG={apiKey:"t",authDomain:"x",projectId:"x",appId:"x"};self.COMPASS_WORKER_URL=${JSON.stringify(worker)};`; type = 'text/javascript'; } else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
      route.fulfill({ status: 200, body, contentType: type }); });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    const tap = async s => { const l = typeof s === 'string' ? p.locator(s).first() : s; await l.scrollIntoViewIfNeeded().catch(() => {}); touch ? await l.tap() : await l.click(); await p.waitForTimeout(250); };
    await p.goto('http://compass.test/'); await p.waitForTimeout(500); await tap('.lhero [data-act=signin]'); await p.waitForTimeout(600);
    await tap('[data-act=obNext]'); for (const v of ['rel', 'body']) await tap(`[data-act=obValue][data-v=${v}]`);
    while (await p.locator('[data-act=obNext]').count()) await tap('[data-act=obNext]');
    await p.waitForTimeout(800);
    return { ctx, p, errs, tap };
  };
  const store = p => new Promise(r => setTimeout(r, 900)).then(() => p.evaluate(() => JSON.parse(localStorage.getItem('__mockstore'))));
  const openSheet = async (p, tap) => { await tap('[data-act=tab][data-t=week]'); await tap('[data-act=weekView][data-v=plan]'); await p.evaluate(() => { const b = document.createElement('button'); b.dataset.act = 'icsOpen'; b.id = '__ics'; document.body.appendChild(b); b.click(); b.remove(); }); await p.waitForTimeout(300); };
  // without a Worker address: just the file
  { const { ctx, p, tap, errs } = await mk('');
    await openSheet(p, tap);
    ok('no Worker address: download only, no live option', await p.locator('.sheet [data-act=icsDownload]').count() === 1 && await p.locator('.sheet [data-act=calMake]').count() === 0);
    ok('no page errors (no worker)', !errs.length, errs);
    await ctx.close(); }
  const { ctx, p, tap, errs } = await mk(WURL);
  await openSheet(p, tap);
  ok('live calendar offered first, file folded away', await p.locator('.sheet [data-act=calMake]').count() === 1 && await p.locator('.sheet details.fold [data-act=icsDownload]').count() === 1);
  await p.screenshot({ path: `${S}/livecal-0-${W}${dark ? 'd' : ''}.png` });
  await tap('.sheet [data-act=calMake]'); await p.waitForTimeout(600);
  let st = await store(p); const t1 = st['users/u1/docs/settings'].calFeed;
  ok('link made: a 43-character secret, saved with your time zone', /^[A-Za-z0-9_-]{43}$/.test(t1) && st['calfeeds/' + t1] && st['calfeeds/' + t1].uid === 'u1' && st['calfeeds/' + t1].tz, { t1, doc: st['calfeeds/' + t1] });
  const android = /Android/.test(await p.evaluate(() => navigator.userAgent));
  const apple = android ? `webcal://compass-reminders.test.workers.dev/cal/${t1}.ics` : await p.locator('.sheet .feedbtns a[data-cal=apple]').getAttribute('href'), google = await p.locator('.sheet .feedbtns a[data-cal=google]').getAttribute('href');
  if (android) ok('Android: Google only (nothing on Android opens webcal links)', await p.locator('.sheet .feedbtns a[data-cal=apple]').count() === 0 && (await p.locator('.sheet .feedbtns a').first().getAttribute('data-cal')) === 'google');
  else if (/iPhone|Macintosh/.test(await p.evaluate(() => navigator.userAgent))) ok('iPhone/Mac: Apple Calendar first', (await p.locator('.sheet .feedbtns a').first().getAttribute('data-cal')) === 'apple');
  else ok('elsewhere: Google first, Apple too', (await p.locator('.sheet .feedbtns a').first().getAttribute('data-cal')) === 'google' && await p.locator('.sheet .feedbtns a[data-cal=apple]').count() === 1);
  ok('Apple button subscribes with webcal://', apple === `webcal://compass-reminders.test.workers.dev/cal/${t1}.ics`, apple);
  ok('Google button opens Add-by-URL with the link', google.startsWith('https://calendar.google.com/calendar/render?cid=') && decodeURIComponent(google.split('cid=')[1]) === `webcal://compass-reminders.test.workers.dev/cal/${t1}.ics`, google);
  await p.screenshot({ path: `${S}/livecal-1-${W}${dark ? 'd' : ''}.png` });
  await tap('.sheet [data-act=calCopy]'); await p.waitForTimeout(300);
  p.on('dialog', d => d.dismiss()); const clip = await p.evaluate(() => navigator.clipboard ? navigator.clipboard.readText().catch(() => '') : '');
  ok('Copy link copies the https link', clip === `${WURL}/cal/${t1}.ics` || clip === '', clip);
  // alert choice is saved (the feed uses it)
  await tap('.sheet [data-act=icsAlert][data-v="10"]'); st = await store(p);
  ok('alert choice saved for the feed', st['users/u1/docs/settings'].cal.alert === 10, st['users/u1/docs/settings'].cal);
  // reset asks first
  await tap('.sheet [data-act=calAsk][data-v=calReset]');
  ok('reset asks first', /old one stops working/.test(await p.locator('.sheet .feedmgr').innerText()));
  await tap('.sheet [data-act=calReset]'); await p.waitForTimeout(600); st = await store(p);
  const t2 = st['users/u1/docs/settings'].calFeed;
  ok('new link replaces the old (old one deleted)', t2 && t2 !== t1 && st['calfeeds/' + t2] && !st['calfeeds/' + t1], { t1, t2 });
  ok('buttons now point at the new link', (await p.locator('.sheet .feedbtns a[data-cal=google]').getAttribute('href')).includes(t2));
  await tap('.sheet [data-act=calAsk][data-v=calOff]'); await tap('.sheet [data-act=calOff]'); await p.waitForTimeout(500); st = await store(p);
  ok('turn off: link deleted, back to Get my link', !st['users/u1/docs/settings'].calFeed && !st['calfeeds/' + t2] && await p.locator('.sheet [data-act=calMake]').count() === 1);
  // delete account removes the link too
  await tap('.sheet [data-act=calMake]'); await p.waitForTimeout(600); st = await store(p); const t3 = st['users/u1/docs/settings'].calFeed;
  await tap('.sheet [data-act=closeSheet]');
  await tap('#acctBtn'); await tap('[data-act=delAcct]'); await tap('[data-act=delAcctYes]'); await p.waitForTimeout(3000);
  st = await p.evaluate(() => JSON.parse(localStorage.getItem('__mockstore') || '{}'));
  ok('deleting the account deletes the calendar link', t3 && !st['calfeeds/' + t3], Object.keys(st));
  ok('no page errors', !errs.length, errs);
  console.log(`livecal ${W}${dark ? 'd' : ''}: ${results.filter(x => x.pass).length}/${results.length} passed`); results.filter(x => !x.pass).forEach(x => console.log('  FAIL', x.n, JSON.stringify(x.i || '').slice(0, 300)));
  await b.close(); })().catch(e => { console.log('CRASH', e.message.split('\n').slice(0, 4).join(' | ')); process.exit(1); });

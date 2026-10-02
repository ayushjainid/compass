// Today: daily floors ordered by their time, untimed last. Export: daily floors included (timed + all-day)
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../public'), S = process.env.S;
const W = +(process.env.W || 390), H = +(process.env.H || 844), touch = process.env.T !== '0';
const results = []; const ok = (n, c, i) => results.push({ n, pass: !!c, i: c ? undefined : i });
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, colorScheme: 'dark', deviceScaleFactor: 2, acceptDownloads: true });
  await ctx.addInitScript(() => { const o = URL.createObjectURL; URL.createObjectURL = blob => { blob.text().then(t => { window.__ics = t; }); return o.call(URL, blob); }; });
  await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort()); await ctx.route('http://compass.test/**', async route => { const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type;
    if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; } else if (p === '/firebase-config.js') { body = 'window.COMPASS_FIREBASE_CONFIG={apiKey:"t",authDomain:"x",projectId:"x",appId:"x"}'; type = 'text/javascript'; } else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
    route.fulfill({ status: 200, body, contentType: type }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const tap = async s => { const l = p.locator(s).first(); await l.scrollIntoViewIfNeeded().catch(()=>{}); touch ? await l.tap() : await l.click(); await p.waitForTimeout(200); };
  await p.goto('http://compass.test/'); await p.waitForTimeout(500); await tap('.lhero [data-act=signin]'); await p.waitForTimeout(600);
  await tap('[data-act=obNext]'); for (const v of ['rel', 'body']) await tap(`[data-act=obValue][data-v=${v}]`);
  while (await p.locator('[data-act=obNext]').count()) await tap('[data-act=obNext]');
  await p.waitForTimeout(400); await tap('[data-act=tab][data-t=compass]'); await tap('[data-act=cSec][data-k=values]');
  const add = async (name, time) => {
    await tap('[data-act=addComp][data-value=body]'); await tap('[data-act=customComp]'); await p.waitForTimeout(250);
    await p.fill('#c-name', name); await tap('[data-act=cCad][data-v=daily]');
    if (time) { await tap('[data-act=cBlock]'); for (let i = 0; i < 7; i++) { if (await p.locator(`[data-act=cDay][data-v="${i}"][aria-pressed=false]`).count()) await tap(`[data-act=cDay][data-v="${i}"]`); } await p.fill('#c-time', time); await p.locator('#c-time').dispatchEvent('change'); }
    await tap('[data-act=saveComp]'); await p.waitForTimeout(300);
  };
  await add('Skincare PM', '21:30'); await add('Untimed thing'); await add('Skincare AM', '07:15');
  await p.waitForTimeout(800);
  await tap('[data-act=tab][data-t=today]');
  const names = await p.locator('.check[data-act=anchor] .lbl > span:first-child').allInnerTexts();
  const iAM = names.indexOf('Skincare AM'), iPM = names.indexOf('Skincare PM'), iU = names.indexOf('Untimed thing');
  ok('timed dailies come first, in time order; untimed below', iAM === 0 && iPM === 1 && iU > iPM, names);
  ok('row shows its time', /7:15 am/.test(await p.locator('.check:has-text("Skincare AM")').innerText()));
  await p.screenshot({ path: `${S}/dailyorder-${W}.png` });
  // export
  await tap('[data-act=tab][data-t=compass]'); await tap('[data-act=cSec][data-k=cal]');
  ok('export available even with only daily floors', !(await p.locator('#csec-cal [data-act=icsOpen]').isDisabled()));
  await tap('#csec-cal [data-act=icsOpen]'); await p.waitForTimeout(300);
  ok('export sheet offers how to include untimed dailies', await p.locator('[data-act=icsDaily]').count() === 3);
  const grab = async () => { await p.evaluate(() => { window.__ics = null; }); await tap('[data-act=icsDownload]'); await p.waitForFunction(() => window.__ics, null, { timeout: 5000 }); return (await p.evaluate(() => window.__ics)).replace(/\r\n /g, ''); };
  let ics = await grab();
  const ev = name => ics.split('BEGIN:VEVENT').find(x => x.includes('SUMMARY:' + name)) || '';
  ok('timed daily exported at its time on its days', /DTSTART;TZID=[^:]+:\d{8}T071500/.test(ev('Skincare AM')) && /BYDAY=MO,TU,WE,TH,FR,SA,SU/.test(ev('Skincare AM')), ev('Skincare AM'));
  ok('untimed daily exported as all-day, every day', /DTSTART;VALUE=DATE:/.test(ev('Untimed thing')) && /RRULE:FREQ=DAILY/.test(ev('Untimed thing')), ev('Untimed thing'));
  ok('library dailies without a time are exported too', /SUMMARY:Reach out to someone close/.test(ics) || /SUMMARY:Slept 7\+ hours/.test(ics) || /SUMMARY:Workout/.test(ics), ics.match(/SUMMARY:.*/g));
  await tap('[data-act=icsDaily][data-v=one]'); ics = await grab();
  ok('"one list" makes a single all-day Daily floors event', (ics.match(/SUMMARY:Daily floors/g) || []).length === 1 && !/SUMMARY:Untimed thing/.test(ics) && /Untimed thing/.test(ics));
  await tap('[data-act=icsDaily][data-v=none]'); ics = await grab();
  ok('"leave out" drops untimed dailies but keeps timed ones', !/Untimed thing/.test(ics) && /SUMMARY:Skincare AM/.test(ics));
  await tap('[data-act=icsDaily][data-v=each]'); ics = await grab();
  ok('timed events alert at start', /BEGIN:VALARM[\s\S]*?TRIGGER:-PT0M[\s\S]*?END:VALARM/.test(ev('Skincare AM')), ev('Skincare AM'));
  ok('all-day events have no alert', !/VALARM/.test(ev('Untimed thing')));
  await tap('[data-act=icsAlert][data-v="10"]'); ics = await grab();
  ok('10 min before option', /TRIGGER:-PT10M/.test(ev('Skincare AM')));
  await tap('[data-act=icsAlert][data-v="-1"]'); ics = await grab();
  ok('no alerts option', !/VALARM/.test(ics));
  ok('valid calendar file', ics.startsWith('BEGIN:VCALENDAR') && ics.trim().endsWith('END:VCALENDAR') && (ics.match(/BEGIN:VEVENT/g) || []).length === (ics.match(/END:VEVENT/g) || []).length);
  await p.screenshot({ path: `${S}/icssheet-${W}.png` });
  ok('no page errors', errs.length === 0, errs);
  const f = results.filter(r => !r.pass); console.log(`dailyics ${W}: ${results.length - f.length}/${results.length} passed`); f.forEach(x => console.log('  FAIL', x.n, JSON.stringify(x.i || '').slice(0, 400)));
  await b.close(); })().catch(e => { console.log('CRASH', e.message.split('\n')[0]); results.filter(r => !r.pass).forEach(x => console.log('  FAIL', x.n, JSON.stringify(x.i || '').slice(0, 300))); process.exit(1); });

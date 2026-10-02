// axe-core across every screen and sheet, light and dark
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../public'), S = process.env.S, AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const W = +(process.env.W || 390), H = +(process.env.H || 844), touch = process.env.T !== '0', dark = process.env.D === '1';
const VAPID = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, channel: process.env.CHROMIUM ? undefined : 'chromium' });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, colorScheme: dark ? 'dark' : 'light' });
  await ctx.route(/^https?:\/\/(fonts\.(googleapis|gstatic)\.com|www\.google\.com|accounts\.google\.com)\//, r => r.abort()); await ctx.route('http://compass.test/**', async route => { const u = new URL(route.request().url()); let p = u.pathname === '/' ? '/index.html' : u.pathname, body, type;
    if (p === '/vendor/firebase.js') { body = fs.readFileSync(path.join(__dirname, 'mockfb.js')); type = 'text/javascript'; } else if (p === '/firebase-config.js') { body = `window.COMPASS_FIREBASE_CONFIG={apiKey:"t",authDomain:"x",projectId:"x",appId:"x"};window.COMPASS_VAPID_PUBLIC="${VAPID}"`; type = 'text/javascript'; } else { try { body = fs.readFileSync(path.join(root, p)); } catch (e) { return route.fulfill({ status: 404, body: '' }); } type = p.endsWith('.js') ? 'text/javascript' : 'text/html'; }
    route.fulfill({ status: 200, body, contentType: type }); });
  const p = await ctx.newPage();
  const tap = async s => { const l = p.locator(s).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); touch ? await l.tap({ timeout: 8000 }) : await l.click({ timeout: 8000 }); await p.waitForTimeout(300); };
  const found = {};
  const scan = async name => {
    await p.waitForTimeout(400);
    const r = await p.evaluate(async src => { if (!window.axe) eval(src); const res = await axe.run(document, { resultTypes: ['violations'], rules: { region: { enabled: false } } }); return res.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 6).map(n => ({ t: n.target.join(' '), s: (n.failureSummary || '').split('\n').slice(1, 2).join(' ').slice(0, 160), h: n.html.slice(0, 120) })) })); }, AXE);
    r.forEach(v => { const k = v.id; found[k] = found[k] || { impact: v.impact, help: v.help, where: [] }; v.nodes.forEach(n => found[k].where.push(name + ' :: ' + n.t + ' :: ' + n.s + ' :: ' + n.h)); });
  };
  await p.goto('http://compass.test/'); await p.waitForTimeout(600); await scan('landing');
  await tap('.lhero [data-act=signin]'); await p.waitForTimeout(700); await scan('ob-welcome');
  await tap('[data-act=obNext]'); for (const v of ['rel', 'body', 'mind']) await tap(`[data-act=obValue][data-v=${v}]`); await tap('[data-act=obCore][data-v=body]'); await tap('[data-act=obWhy]'); await scan('ob-values');
  await tap('[data-act=obNext]'); await tap('[data-act=obWeekAdv]'); await scan('ob-week');
  await tap('[data-act=obNext]'); await tap('[data-act=obEdit]'); await scan('ob-floors');
  await tap('[data-act=obEditDone]'); await tap('[data-act=obNext]'); await p.waitForTimeout(800);
  await scan('today');
  await tap('.dayrow'); await p.waitForTimeout(600); await tap('[data-act=doneFold]'); await scan('today-done');
  await tap('[data-act=tab][data-t=week]'); await scan('week-floors');
  await tap('[data-act=weekView][data-v=plan]'); await scan('plan');
  await tap('.ptray .pchip').catch(() => {}); await scan('place-sheet'); await tap('.sheet [data-act=closeSheet] >> nth=0').catch(() => {});
  await tap('[data-act=tab][data-t=tasks]'); await scan('tasks');
  await tap('[data-act=tab][data-t=review]'); await scan('review');
  await tap('[data-act=tab][data-t=compass]');
  for (const k of ['goal', 'week', 'load', 'values', 'season', 'people', 'ifthen', 'cal', 'remind', 'app']) { if (await p.locator(`[data-act=cSec][data-k=${k}][aria-expanded=false]`).count()) await tap(`[data-act=cSec][data-k=${k}]`); }
  await scan('compass-all-open');
  await tap('[data-act=editComp]'); await scan('component-sheet'); await tap('.sheet .sheetx');
  await tap('[data-act=fbOpen]'); await scan('feedback-sheet'); await tap('.sheet .sheetx');
  await tap('#csec-cal [data-act=icsOpen]'); await scan('export-sheet'); await tap('.sheet .sheetx');
  await tap('#acctBtn'); await scan('account-sheet');
  const out = Object.entries(found).map(([k, v]) => `${k} [${v.impact}] ${v.help}\n   ${[...new Set(v.where)].slice(0, 14).join('\n   ')}${v.where.length > 14 ? `\n   …+${v.where.length - 14}` : ''}`).join('\n');
  console.log(`a11y ${W}${dark ? 'd' : ''}: ${Object.keys(found).length} rule(s) violated\n` + out);
  await b.close(); })().catch(e => { console.log('CRASH', e.message.split('\n')[0]); process.exit(1); });

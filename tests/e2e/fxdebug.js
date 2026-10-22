// Diagnostic (temporary): open a task's sheet in the current engine, edit the note, tap the fold, report the state as CI annotations.
process.env.W = process.env.W || '1280'; process.env.H = process.env.H || '900'; process.env.T = process.env.T || '0';   // the failing variant: desktop, mouse
const { chromium, NAME } = require('./engine');
const { newCtx, newPage, onboard, launch } = require('./harness');
const say = m => console.log(`::error title=${NAME} fxdebug::${String(m).replace(/\n/g, ' | ').slice(0, 900)}`);
(async () => { const b = await launch(chromium);
  const ctx = await newCtx(b), pg = await newPage(ctx), { p, errs, tap } = pg;
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push('console: ' + m.text()); });
  await onboard(pg);
  await tap('[data-act=tab][data-t=tasks]'); await p.waitForTimeout(600);
  await p.locator('#qAdd').fill('Buy bread #groceries'); await p.keyboard.press('Enter'); await p.waitForTimeout(600);
  await tap('[data-act=tv][data-v=inbox]').catch(() => {});
  await tap('.lrow .ltx:has-text("bread")').catch(e => say('open: ' + e.message));
  await p.waitForTimeout(400);
  await p.locator('#iTitle').fill('Sourdough bread'); await p.locator('#iNote').click(); await p.locator('#iNote').fill('From the corner bakery');
  const st = async label => say(label + ' ' + JSON.stringify(await p.evaluate(() => { const m = document.getElementById('iMore'), s = document.getElementById('iSubIn'), b = m && m.querySelector('.imoresum'); const r = b && b.getBoundingClientRect(); return { cls: m && m.className, sub: !!s, subVis: !!s && s.offsetParent !== null, active: document.activeElement && (document.activeElement.id || document.activeElement.className), btn: r && [Math.round(r.top), Math.round(r.height)], vh: innerHeight, sheetScroll: (document.querySelector('.sheet') || {}).scrollTop, html: m && m.outerHTML.slice(0, 160) }; })));
  await st('before tap');
  let hits = 0; await p.exposeFunction('__hit', () => { hits++; }).catch(() => {});
  await p.evaluate(() => document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.imoresum')) window.__hit(); }, true));
  try { await tap('.sheet #iMore .imoresum'); } catch (e) { say('tap failed: ' + e.message); }
  await st('right after tap'); await p.waitForTimeout(1200); await st('1.2s later');
  say('clicks seen on the fold button: ' + hits + ' · errors: ' + JSON.stringify(errs).slice(0, 400));
  await b.close();
})().catch(e => { say('CRASH ' + e.message); process.exit(1); });

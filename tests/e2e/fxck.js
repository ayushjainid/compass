// Diagnostic: what a mouse drag on the check-in card delivers in this engine.
const { chromium } = require('./engine');
const { newCtx, newPage, launch } = require('./harness');
(async () => { const b = await launch(chromium); const ctx = await newCtx(b), { p, tap } = await newPage(ctx);
  const t = new Date(); t.setHours(21, 0, 0, 0); await p.clock.setFixedTime(t);
  await p.goto('http://compass.test/'); await p.waitForTimeout(500);
  await tap('.lhero [data-act=signin]'); await p.waitForTimeout(600);
  await tap('[data-act=obNext]'); for (const v of ['rel', 'body']) await tap(`[data-act=obValue][data-v=${v}]`);
  while (await p.locator('[data-act=obNext]').count()) await tap('[data-act=obNext]');
  await p.waitForTimeout(600); await tap('[data-act=introDone]').catch(() => {});
  await tap('.ckinvite [data-act=ckOpen]'); await p.waitForTimeout(500);
  await p.evaluate(() => { window.__ev = []; const el = document.getElementById('ckCard'); ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'dragstart', 'touchstart', 'mousedown', 'mouseup', 'lostpointercapture'].forEach(n => el.addEventListener(n, e => window.__ev.push(n + ':' + (e.pointerType || '') + ':' + Math.round(e.clientX || 0)), true)); });
  const c = await p.locator('#ckCard').boundingBox(); console.log('box', JSON.stringify(c));
  await p.mouse.move(c.x + c.width / 2, c.y + 60); await p.mouse.down(); await p.mouse.move(c.x + c.width / 2 + 130, c.y + 62, { steps: 5 }); await p.mouse.move(c.x + c.width / 2 + 260, c.y + 64, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(600);
  console.log('events', JSON.stringify(await p.evaluate(() => window.__ev)));
  console.log('step', await p.locator('.ck .hint').first().innerText(), 'cls', await p.locator('#ckCard').getAttribute('class'));
  await b.close(); })().catch(e => { console.log('CRASH', e.message); process.exit(1); });

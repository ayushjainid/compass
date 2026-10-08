// Which plain-div taps reach a page-level click handler on this engine (diagnostic, not part of the suite list)
const { chromium } = require('./engine');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.setContent(`<style>div{height:80px;margin:6px;background:#ccc}</style>
    <div id=plain></div><div id=cursor style="cursor:pointer"></div><div id=ta style="touch-action:none"></div><div id=both style="touch-action:none;cursor:pointer"></div>
    <div id=fixed style="position:fixed;left:0;right:0;bottom:0;height:200px;touch-action:none;cursor:pointer;margin:0"></div>
    <script>window.got=[];document.addEventListener('click',e=>got.push(e.target.id));</script>`);
  for (const id of ['plain', 'cursor', 'ta', 'both', 'fixed']) { await p.locator('#' + id).tap({ position: { x: 20, y: 20 } }); await p.waitForTimeout(400); }
  const got = await p.evaluate(() => window.got);
  console.log(`::warning title=tap probe::taps that reached the click handler: ${JSON.stringify(got)} (of plain, cursor, ta, both, fixed)`);
  console.log('0/1 passed'); await b.close();
})();

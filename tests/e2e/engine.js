// Lets every suite run on Chromium (Android/Chrome), WebKit (iPhone/Safari) or Firefox: BROWSER=webkit node x.js
// Suites call `chromium.launch(...)`; this hands back the chosen engine and drops options it doesn't have.
const pw = require('playwright');
const NAME = process.env.BROWSER || 'chromium';
/* DEVICE=iphone|android: phone-sized contexts also say they're that phone (the app reads this for iPhone-only advice) */
const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
}[process.env.DEVICE || ''];
const engine = pw[NAME];
if (!engine) throw new Error('Unknown BROWSER ' + NAME);

/* Chrome's DevTools protocol drives finger drags and swipes in the suites. Other engines don't have it, so this
   stand-in fires the same event sequence a phone does (pointer events with pointerType "touch", plus touch events
   that keep going to the element the finger started on) and scrolls the way a swipe would.
   TOUCH_SHIM=1 uses it on Chromium too, to check the stand-in against the real thing. */
function touchShim(page) {
  const touch = (type, x, y) => page.evaluate(([type, x, y]) => {
    const S = window.__shimTouch || (window.__shimTouch = {});
    const point = t => ({ clientX: x, clientY: y, pageX: x + scrollX, pageY: y + scrollY, screenX: x, screenY: y, identifier: 1, target: t, radiusX: 10, radiusY: 10, force: 1 });
    const tev = (name, t, list) => { const e = new Event(name, { bubbles: true, cancelable: true, composed: true });
      Object.defineProperty(e, 'touches', { value: list }); Object.defineProperty(e, 'targetTouches', { value: list }); Object.defineProperty(e, 'changedTouches', { value: [point(t)] }); return e; };
    const pev = (name, t, buttons) => t.dispatchEvent(new PointerEvent(name, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, screenX: x, screenY: y, pointerType: 'touch', pointerId: 7, isPrimary: true, button: name === 'pointermove' ? -1 : 0, buttons, width: 20, height: 20, pressure: buttons ? 0.5 : 0 }));
    const hit = () => document.elementFromPoint(x, y) || document.body;
    if (type === 'touchStart') { const t = hit(); Object.assign(S, { t, x, y }); pev('pointerdown', t, 1); t.dispatchEvent(tev('touchstart', t, [point(t)])); return; }
    const t = S.t; if (!t) return;
    if (type === 'touchMove') { S.x = x; S.y = y; pev('pointermove', t.isConnected ? t : hit(), 1); t.dispatchEvent(tev('touchmove', t, [point(t)])); return; }
    x = S.x; y = S.y; pev('pointerup', t.isConnected ? t : hit(), 0); t.dispatchEvent(tev('touchend', t, [])); window.__shimTouch = {};
  }, [type, x || 0, y || 0]);
  /* a swipe scrolls whatever is under the finger, and is blocked where the page locks scrolling, like the wheel */
  const scroll = async (x, y, dy) => { await page.mouse.move(x, y); await page.mouse.wheel(0, dy); };
  return { send: async (method, a = {}) => {
    if (method === 'Input.dispatchTouchEvent') { const pt = (a.touchPoints || [])[0] || {}; return touch(a.type, pt.x, pt.y); }
    if (method === 'Input.synthesizeScrollGesture') { await scroll(a.x, a.y, -(a.yDistance || 0)); return page.waitForTimeout(250); }
    throw new Error('Chrome-only gesture: ' + method);
  } };
}

const chromium = {
  name: NAME,
  async launch(opts = {}) {
    const o = Object.assign({}, opts);
    if (NAME !== 'chromium') { delete o.channel; delete o.executablePath; }
    const b = await engine.launch(o);
    const newContext = b.newContext.bind(b);
    b.newContext = async (c = {}) => {
      const x = Object.assign({}, c);
      if (NAME === 'firefox') delete x.isMobile;          // Firefox has touch but no "mobile" mode
      if (UA && !x.userAgent && x.hasTouch) x.userAgent = UA;
      const ctx = await newContext(x);
      if (NAME !== 'chromium' || process.env.TOUCH_SHIM) ctx.newCDPSession = async page => touchShim(page);
      return ctx;
    };
    return b;
  },
};
module.exports = { chromium, NAME };

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
      if (NAME !== 'chromium') ctx.newCDPSession = async () => ({ send: async () => { throw new Error('Chrome-only gesture'); } });
      return ctx;
    };
    return b;
  },
};
module.exports = { chromium, NAME };

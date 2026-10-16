// Quick-add date reading (parseQuick) and repeat dates (nextDue), pulled out of the app and run with a pinned clock.
//   node tests/unit/quickadd.js            (cases in quickadd.json, each set with the 'now' it assumes)
const fs = require('fs'); const src = fs.readFileSync(require('path').join(__dirname, '../../public/index.html'), 'utf8');
const grab = re => { const m = src.match(re); if (!m) throw new Error('missing ' + re); return m[0]; };
const fnSrc = name => { const i = src.indexOf('function ' + name + '('); let depth = 0, j = src.indexOf(') {', i) + 2; for (let k = j; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}') { depth--; if (!depth) return src.slice(i, k + 1); } } };
const lines = n => src.split('\n').find(l => l.startsWith(n));
const RealDate = Date; let NOW = '2026-10-16T10:00:00';
global.Date = class extends RealDate { constructor(...a) { if (!a.length) super(new RealDate(NOW).getTime()); else super(...a); } static now() { return new RealDate(NOW).getTime(); } };
const code = [
  'const pad = n => String(n).padStart(2, "0");',
  lines('const dkey ='), lines('const parse ='), lines('const addDays ='), lines('const todayKey ='), lines('const MON ='), lines('const WD ='), lines('const fmtShort ='), lines('const daysBetween ='),
  'const t12 = x => x;', 'const listsArr = () => [{ id: "l-g", name: "Groceries" }, { id: "l-w", name: "Work stuff" }]; const inboxId = () => "in-u1"; const listName = x => x;',
  lines('const fmtWhen ='), lines('const REP_LABEL ='), lines('const repWords ='), lines('const tstrNow ='),
  ...['const DAYW =', 'const dayWIdx =', 'const MONW =', 'const MON_RX =', 'const DAY_FULL =', 'const DAY_SHORT =', 'const END =', 'const nextWeekday =', 'const normName ='].map(lines),
  fnSrc('parseQuick'), fnSrc('nextDue'),
].join('\n');
eval(code + `
global.PQ = parseQuick; global.ND = nextDue;`);
const sets = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'quickadd.json'), 'utf8'));
let bad = 0, n = 0;
for (const cases of sets) { NOW = cases.now;
for (const [input, want] of cases.pq || []) { let q; try { q = PQ(input); } catch (e) { console.log('THROWS', input, e.message); bad++; continue; }
  const got = { t: q.t, due: q.due, tm: q.tm, rep: q.rep && JSON.stringify(q.rep), lid: q.lid, newList: q.newList };
  const fail = Object.entries(want).filter(([k, v]) => got[k] !== v); if (fail.length) { bad++; console.log('FAIL', cases.now, JSON.stringify(input), JSON.stringify(got), 'want', JSON.stringify(want)); } }
for (const [it, want] of cases.nd || []) { const g = ND(it); if (g !== want) { bad++; console.log('FAIL nd', JSON.stringify(it), g, 'want', want); } }
n += (cases.pq || []).length + (cases.nd || []).length; }
console.log(`quick add: ${n - bad}/${n} passed`); process.exit(bad ? 1 : 0);

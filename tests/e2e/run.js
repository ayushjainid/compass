// Runs every browser test suite against public/ with the mock Firebase SDK and reports pass/fail.
//   node tests/e2e/run.js            all suites
//   node tests/e2e/run.js daylist    only suites whose file name contains "daylist"
// Screenshots go to tests/e2e/out/. Set CHROMIUM to use a specific browser binary; JOBS for parallelism.
const { spawn } = require("child_process"), path = require("path"), fs = require("fs");
const OUT = path.join(__dirname, "out"); fs.mkdirSync(OUT, { recursive: true });
const PHONE = {}, SMALL = { W: "320" }, DARK = { D: "1" }, DESK = { W: "1280", H: "900", T: "0" };
const X = { X: "1" };
// [file, env] — the sizes each suite is meant to run at
const JOBS = [
  ["full2.js", X], ["full2.js", DARK], ["full.js", X], ["fix7.js", X], ["ob3.js", X], ["persist.js", X],
  ["daylist.js", PHONE], ["daylist.js", SMALL], ["daylist.js", DARK], ["daylist.js", DESK],
  ["remind.js", PHONE], ["csec.js", PHONE], ["compsheet.js", PHONE], ["compsheet.js", DESK], ["mstest.js", X], ["every.js", PHONE],
  ["dailyics.js", PHONE], ["clearplan.js", PHONE], ["hover.js", X], ["deskhover.js", DESK], ["zoom.js", X],
  ["sync.js", X], ["restore.js", PHONE], ["offline.js", X], ["fb.js", PHONE], ["fhist.js", PHONE], ["fade.js", PHONE],
  ["idle.js", X], ["strip.js", X], ["merge3.js", X],
  ["dailydays.js", PHONE], ["dailydays.js", DESK], ["newfeat.js", PHONE], ["newfeat.js", DESK],
  ["statspage.js", PHONE], ["statspage.js", DARK], ["statspage.js", DESK],
  ["tasks2.js", PHONE], ["tasks2.js", SMALL], ["tasks2.js", DARK], ["tasks2.js", DESK],
  ["admin.js", PHONE], ["admin.js", DESK], ["appcheck.js", X],
  ["livecal.js", PHONE], ["livecal.js", DARK], ["livecal.js", DESK],
  ["lookback.js", PHONE], ["lookback.js", SMALL], ["lookback.js", DARK], ["lookback.js", DESK],
  ["emailauth.js", PHONE], ["emailauth.js", SMALL], ["emailauth.js", DARK], ["emailauth.js", DESK],
  ["a11y.js", X],
];
/* a suite passes when it exits cleanly, prints no FAIL line, and its summary says everything passed */
// a11y: the only accepted axe finding is the deliberate zoom lock (meta-viewport)
const A11Y_OK = ["meta-viewport"];
function judge(file, code, out) {
  if (code !== 0) return `exited with code ${code}`;
  if (file === "a11y.js") { if (!/rule\(s\) violated/.test(out)) return "no a11y summary"; const rules = [...out.matchAll(/^(\S+) \[(minor|moderate|serious|critical)\]/gm)].map(m => m[1]).filter(r => !A11Y_OK.includes(r)); return rules.length ? "accessibility: " + rules.join(", ") : null; }
  if (/^\s*FAIL\b/m.test(out)) return "a check failed";
  const counts = [...out.matchAll(/(\d+)\/(\d+) passed/g)];
  if (counts.length) return counts.every(m => m[1] === m[2]) ? null : "not every check passed";
  const json = /"failed":\s*\[\s*\]/.test(out) || (/"steady":\s*true/.test(out) && /"errs":\s*\[\s*\]/.test(out));
  if (json) return null;
  return "no pass summary found";
}
/* gestures driven through Chrome's debugging protocol (pinch, touch-drag) can only be simulated on Chromium */
const ENGINE = process.env.BROWSER || "chromium", CHROME_ONLY = ["zoom.js", "hover.js"];
const want = process.argv.slice(2);
const jobs = JOBS.filter(([f]) => (!want.length || want.some(w => f.includes(w))) && (ENGINE === "chromium" || !CHROME_ONLY.includes(f)));
/* the permission-prompt reminder suites assume a browser that allows web notifications: an iPhone only does once
   Compass is on the Home Screen (remind.js covers both iPhone cases itself), so on iPhone/WebKit runs they run as desktop */
if (process.env.DEVICE === "iphone" || ENGINE === "webkit") jobs.forEach((j, i) => { if (["remind.js", "fade.js"].includes(j[0])) jobs[i] = [j[0], Object.assign({}, j[1], { T: "0" })]; });
const par = Math.max(1, +(process.env.JOBS || 4));
let next = 0, failed = [], t0 = Date.now();
function runOne([file, env]) {
  return new Promise(res => {
    const tag = file + (Object.keys(env).length ? " " + Object.entries(env).map(([k, v]) => `${k}=${v}`).join(" ") : "");
    const p = spawn(process.execPath, [path.join(__dirname, file)], { cwd: __dirname, env: Object.assign({}, process.env, { S: OUT }, env) });
    let out = ""; p.stdout.on("data", d => out += d); p.stderr.on("data", d => out += d);
    const kill = setTimeout(() => { out += "\nTIMEOUT"; p.kill("SIGKILL"); }, 8 * 60 * 1000);
    p.on("close", code => {
      clearTimeout(kill);
      const why = judge(file, code ?? 1, out), last = (out.match(/\d+\/\d+ passed/g) || []).pop() || "";
      if (why && process.env.GITHUB_ACTIONS) {   // show up as annotations on the run summary
        const lines = out.split("\n").filter(l => /FAIL|Error|TIMEOUT|CRASH/.test(l)).slice(0, 6).map(l => l.trim().slice(0, 240));
        console.log(`::error title=${(process.env.BROWSER || "chromium") + (process.env.DEVICE ? "/" + process.env.DEVICE : "")} ${tag.replace(/[,:]/g, " ")}::${(why + " | " + (lines.join(" | ") || out.slice(-600).replace(/\n/g, " | "))).replace(/%/g, "%25").replace(/\r?\n/g, " ")}`);
      }
      if (why) { failed.push(tag); console.log(`✗ ${tag}: ${why}\n${out.split("\n").filter(l => /FAIL|Error|TIMEOUT/.test(l)).slice(0, 12).map(l => "    " + l.slice(0, 300)).join("\n") || out.slice(-1500)}`); }
      else console.log(`✓ ${tag} ${last}`);
      res();
    });
  });
}
(async () => {
  await Promise.all(Array.from({ length: par }, async () => { while (next < jobs.length) await runOne(jobs[next++]); }));
  console.log(`\n[${ENGINE}${process.env.DEVICE ? " as " + process.env.DEVICE : ""}] ${jobs.length - failed.length}/${jobs.length} suites passed in ${Math.round((Date.now() - t0) / 1000)} s`);
  if (failed.length) { console.log("Failed: " + failed.join(", ")); process.exit(1); }
})();

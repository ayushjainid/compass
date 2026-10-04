// Firestore security rules, checked against the real rules engine (the Firestore emulator).
// Run with:  npx firebase-tools emulators:exec --only firestore --project demo-compass "node tests/rules/rules.test.mjs"
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, increment, serverTimestamp, query, where, limit } from "firebase/firestore";

const env = await initializeTestEnvironment({
  projectId: "demo-compass",
  firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8") },
});
const R = []; let current = "";
const t = async (name, p) => { current = name; try { await p; R.push([name, true]); } catch (e) { R.push([name, false, e.message.split("\n")[0]]); } };

const me = env.authenticatedContext("alice").firestore();
const other = env.authenticatedContext("bob").firestore();
const owner = env.authenticatedContext("owner").firestore();
const anon = env.unauthenticatedContext().firestore();
await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore();
  await setDoc(doc(db, "admins/owner"), { at: 1 });
  await setDoc(doc(db, "users/bob/docs/profile"), { goal: "x" });
  await setDoc(doc(db, "status/reminders"), { ok: true });
  await setDoc(doc(db, "feedback/bob-1"), { uid: "bob", text: "hi" });
  await setDoc(doc(db, "errors/bob"), { items: [], updated: 1 });
});

// ---- your own data
await t("write own profile", assertSucceeds(setDoc(doc(me, "users/alice/docs/profile"), { goal: "grow" })));
await t("write own week doc", assertSucceeds(setDoc(doc(me, "users/alice/docs/w-2026-09-28"), { days: {} })));
await t("read own profile", assertSucceeds(getDoc(doc(me, "users/alice/docs/profile"))));
await t("unknown doc name refused", assertFails(setDoc(doc(me, "users/alice/docs/anything"), { a: 1 })));
await t("someone else's data unreadable", assertFails(getDoc(doc(me, "users/bob/docs/profile"))));
await t("someone else's data unwritable", assertFails(setDoc(doc(me, "users/bob/docs/profile"), { goal: "x" })));
await t("signed out: nothing", assertFails(getDoc(doc(anon, "users/alice/docs/profile"))));

// ---- reminders settings
await t("notify: allowed keys", assertSucceeds(setDoc(doc(me, "notify/alice"), { on: true, tz: "Asia/Kolkata", eve: "21:30", fadeAsk: "2026-10-01" })));
await t("notify: unknown key refused", assertFails(setDoc(doc(me, "notify/alice"), { on: true, evil: 1 })));
await t("notify: someone else's refused", assertFails(setDoc(doc(me, "notify/bob"), { on: true })));

// ---- feedback and errors
await t("feedback: create own", assertSucceeds(setDoc(doc(me, "feedback/alice-123"), { uid: "alice", text: "nice", at: serverTimestamp() })));
await t("feedback: pretend to be bob refused", assertFails(setDoc(doc(me, "feedback/bob-123"), { uid: "bob", text: "x" })));
await t("feedback: read someone else's refused", assertFails(getDoc(doc(me, "feedback/bob-1"))));
await t("feedback: owner can read", assertSucceeds(getDoc(doc(owner, "feedback/bob-1"))));
await t("errors: write own", assertSucceeds(setDoc(doc(me, "errors/alice"), { items: [{ msg: "x" }], updated: 1 })));
await t("errors: owner can list", assertSucceeds(getDocs(collection(owner, "errors"))));
await t("errors: others can't list", assertFails(getDocs(collection(me, "errors"))));

// ---- anonymous usage tallies
await t("stats: create a day tally at 1", assertSucceeds(setDoc(doc(me, "stats/d-2026-10-02"), { active: increment(1) }, { merge: true })));
await t("stats: add 1 to an existing tally", assertSucceeds(setDoc(doc(other, "stats/d-2026-10-02"), { active: increment(1) }, { merge: true })));
await t("stats: add 1 to a new key on the doc", assertSucceeds(setDoc(doc(me, "stats/d-2026-10-02"), { logged: increment(1) }, { merge: true })));
await t("stats: new events count", assertSucceeds(setDoc(doc(me, "stats/d-2026-10-02"), { lookback: increment(1) }, { merge: true })));
await t("stats: week doc + age key", assertSucceeds(setDoc(doc(me, "stats/w-2026-09-28"), { a3: increment(1) }, { merge: true })));
await t("stats: +5 refused", assertFails(setDoc(doc(me, "stats/d-2026-10-02"), { active: increment(5) }, { merge: true })));
await t("stats: setting a number refused", assertFails(setDoc(doc(me, "stats/d-2026-10-02"), { active: 999 }, { merge: true })));
await t("stats: two keys at once refused", assertFails(setDoc(doc(me, "stats/d-2026-10-02"), { active: increment(1), logged: increment(1) }, { merge: true })));
await t("stats: unknown key refused", assertFails(setDoc(doc(me, "stats/d-2026-10-02"), { uid: increment(1) }, { merge: true })));
await t("stats: text refused", assertFails(setDoc(doc(me, "stats/d-2026-10-03"), { active: "alice" })));
await t("stats: odd doc id refused", assertFails(setDoc(doc(me, "stats/alice"), { active: increment(1) }, { merge: true })));
await t("stats: signed out refused", assertFails(setDoc(doc(anon, "stats/d-2026-10-02"), { active: increment(1) }, { merge: true })));
await t("stats: delete refused", assertFails(deleteDoc(doc(me, "stats/d-2026-10-02"))));
await t("stats: people can't read tallies", assertFails(getDocs(collection(me, "stats"))));
await t("stats: owner reads tallies", assertSucceeds(getDocs(collection(owner, "stats"))));
await env.withSecurityRulesDisabled(async c => {
  const d = (await getDoc(doc(c.firestore(), "stats/d-2026-10-02"))).data();
  current = "stats: values add up"; R.push([current, d.active === 2 && d.logged === 1, JSON.stringify(d)]);
});

// ---- calendar feed links
const T1 = "A".repeat(43), T2 = "b".repeat(43);
await t("calfeed: create own", assertSucceeds(setDoc(doc(me, `calfeeds/${T1}`), { uid: "alice", tz: "Asia/Kolkata", at: 1 })));
await t("calfeed: short id refused", assertFails(setDoc(doc(me, "calfeeds/short"), { uid: "alice" })));
await t("calfeed: someone else's uid refused", assertFails(setDoc(doc(me, `calfeeds/${T2}`), { uid: "bob" })));
await t("calfeed: extra fields refused", assertFails(setDoc(doc(me, `calfeeds/${T2}`), { uid: "alice", evil: 1 })));
await t("calfeed: update own time zone", assertSucceeds(setDoc(doc(me, `calfeeds/${T1}`), { uid: "alice", tz: "Europe/London", at: 1 })));
await t("calfeed: can't hand it to someone else", assertFails(setDoc(doc(me, `calfeeds/${T1}`), { uid: "bob", tz: "x", at: 1 })));
await t("calfeed: others can't read it", assertFails(getDoc(doc(other, `calfeeds/${T1}`))));
await t("calfeed: others can't take it over", assertFails(setDoc(doc(other, `calfeeds/${T1}`), { uid: "bob", at: 1 })));
await t("calfeed: others can't delete it", assertFails(deleteDoc(doc(other, `calfeeds/${T1}`))));
await t("calfeed: nobody can list them", assertFails(getDocs(query(collection(me, "calfeeds"), where("uid", "==", "alice"), limit(20)))));
await t("calfeed: delete own", assertSucceeds(deleteDoc(doc(me, `calfeeds/${T1}`))));
await t("notify: names setting allowed", assertSucceeds(setDoc(doc(me, "notify/alice"), { on: true, names: false }, { merge: true })));

// ---- owner-only docs
await t("status: owner reads", assertSucceeds(getDoc(doc(owner, "status/reminders"))));
await t("status: others can't", assertFails(getDoc(doc(me, "status/reminders"))));
await t("status: nobody writes from the app", assertFails(setDoc(doc(owner, "status/reminders"), { ok: false })));
await t("admins: can read own marker", assertSucceeds(getDoc(doc(owner, "admins/owner"))));
await t("admins: can't make yourself owner", assertFails(setDoc(doc(me, "admins/alice"), { at: 1 })));
await t("anything else: closed", assertFails(setDoc(doc(me, "random/thing"), { a: 1 })));

await env.cleanup();
const f = R.filter(x => !x[1]);
f.forEach(x => console.log("  FAIL", x[0], x[2] || ""));
console.log(`rules: ${R.length - f.length}/${R.length} passed`);
process.exit(f.length ? 1 : 0);

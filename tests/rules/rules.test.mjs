// Firestore security rules, checked against the real rules engine (the Firestore emulator).
// Run with:  npx firebase-tools emulators:exec --only firestore --project demo-compass "node tests/rules/rules.test.mjs"
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc, updateDoc, collection, getDocs, increment, serverTimestamp, query, where, limit, arrayUnion, deleteField } from "firebase/firestore";

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
await t("notify: one push address per device", assertSucceeds(setDoc(doc(me, "notify/alice"), { subs: { d1: { endpoint: "https://web.push.apple.com/x", keys: { p256dh: "a", auth: "b" }, dev: "iPhone", at: 1 } }, nextTest: new Date(), test: null }, { merge: true })));
await t("notify: at most 8 devices", assertFails(setDoc(doc(me, "notify/alice"), { subs: Object.fromEntries([...Array(9)].map((_, i) => ["d" + i, { endpoint: "https://x/" + i }])) }, { merge: true })));
await t("notify: still writable after the Worker marks a lost device", assertSucceeds(env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), "notify/alice"), { lost: { d9: true }, test: { at: new Date(), res: [] } }, { merge: true })).then(() => setDoc(doc(me, "notify/alice"), { last: "2026-10-16" }, { merge: true }))));
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

// ---- lists (tasks), shared by invite
const carol = env.authenticatedContext("carol").firestore();
const L1 = { owner: "alice", members: ["alice"], people: { alice: { n: "Alice" } }, name: "Groceries", kind: "list", at: 1 };
await t("list: create your own", assertSucceeds(setDoc(doc(me, "lists/l-0001"), L1)));
await t("list: can't create one naming someone else as owner", assertFails(setDoc(doc(me, "lists/l-0002"), { ...L1, owner: "bob", members: ["bob"] })));
await t("list: can't start a list with others in it", assertFails(setDoc(doc(me, "lists/l-0003"), { ...L1, members: ["alice", "bob"] })));
await t("list: unknown fields refused", assertFails(setDoc(doc(me, "lists/l-0004"), { ...L1, evil: 1 })));
await t("list: can't take someone's Inbox id", assertFails(setDoc(doc(me, "lists/in-bob"), L1)));
await t("list: ids look like l-…", assertFails(setDoc(doc(me, "lists/whatever"), L1)));
await t("inbox: only your own id", assertSucceeds(setDoc(doc(me, "lists/in-alice"), { ...L1, name: "Inbox", kind: "inbox" })));
await t("inbox: not someone else's id", assertFails(setDoc(doc(me, "lists/in-bob"), { ...L1, name: "Inbox", kind: "inbox" })));
await t("list: others can't read it", assertFails(getDoc(doc(other, "lists/l-0001"))));
await t("list: you can query yours", assertSucceeds(getDocs(query(collection(me, "lists"), where("members", "array-contains", "alice")))));
await t("list: can't query everyone's", assertFails(getDocs(collection(me, "lists"))));
await t("item: add to your list", assertSucceeds(setDoc(doc(me, "lists/l-0001/items/i1"), { t: "Milk", open: true, st: "open", by: "alice", at: 1, ord: 1 })));
await t("item: others can't add", assertFails(setDoc(doc(other, "lists/l-0001/items/i2"), { t: "Spam", open: true })));
await t("item: others can't read", assertFails(getDoc(doc(other, "lists/l-0001/items/i1"))));
await t("item: needs a title", assertFails(setDoc(doc(me, "lists/l-0001/items/i3"), { t: "", open: true })));
await t("item: unknown fields refused", assertFails(setDoc(doc(me, "lists/l-0001/items/i4"), { t: "x", open: true, evil: 1 })));
// invites
const now = Date.now(), TOK = "A".repeat(32), TOK2 = "B".repeat(32), TOKW = "W".repeat(32);
await t("invite: make one for your list", assertSucceeds(setDoc(doc(me, "invites/" + TOK), { kind: "list", from: "alice", name: "Alice", list: "l-0001", listName: "Groceries", exp: now + 14 * 864e5, at: now })));
await t("invite: not for a list you're not in", assertFails(setDoc(doc(other, "invites/" + TOK2), { kind: "list", from: "bob", name: "Bob", list: "l-0001", exp: now + 864e5, at: now })));
await t("invite: not for your Inbox", assertFails(setDoc(doc(me, "invites/" + TOK2), { kind: "list", from: "alice", name: "Alice", list: "in-alice", exp: now + 864e5, at: now })));
await t("invite: not pretending to be someone else", assertFails(setDoc(doc(me, "invites/" + TOK2), { kind: "app", from: "bob", name: "Bob", exp: now + 864e5, at: now })));
await t("invite: at most a month", assertFails(setDoc(doc(me, "invites/" + TOK2), { kind: "app", from: "alice", name: "Alice", exp: now + 60 * 864e5, at: now })));
await t("invite: short ids refused", assertFails(setDoc(doc(me, "invites/short"), { kind: "app", from: "alice", name: "Alice", exp: now + 864e5, at: now })));
await t("invite: anyone with the link can read it, even signed out", assertSucceeds(getDoc(doc(anon, "invites/" + TOK))));
await t("invite: nobody can list them", assertFails(getDocs(collection(other, "invites"))));
await t("invite: only its maker deletes it", assertFails(deleteDoc(doc(other, "invites/" + TOK))));
// joining
await t("join: without an invite, refused", assertFails(updateDoc(doc(other, "lists/l-0001"), { members: arrayUnion("bob"), "people.bob": { n: "Bob" } })));
await t("join: with a valid invite, add exactly yourself", assertSucceeds(updateDoc(doc(other, "lists/l-0001"), { members: arrayUnion("bob"), "people.bob": { n: "Bob" }, via: TOK, up: now })));
await t("join: now Bob reads the list and its items", assertSucceeds(getDoc(doc(other, "lists/l-0001/items/i1"))));
await t("join: and adds to it", assertSucceeds(setDoc(doc(other, "lists/l-0001/items/i5"), { t: "Bread", open: true, st: "open", by: "bob", at: 2 })));
await t("join: can't bring a friend along", assertFails(updateDoc(doc(carol, "lists/l-0001"), { members: ["alice", "bob", "carol", "dave"], via: TOK })));
await t("member: can rename the list", assertSucceeds(updateDoc(doc(other, "lists/l-0001"), { name: "Weekly shop", up: now })));
await t("member: can't change someone else's name tag", assertFails(updateDoc(doc(other, "lists/l-0001"), { "people.alice": { n: "Mallory" } })));
await t("member: can't remove others", assertFails(updateDoc(doc(other, "lists/l-0001"), { members: ["bob"] })));
await t("member: can't make themself owner", assertFails(updateDoc(doc(other, "lists/l-0001"), { owner: "bob" })));
await t("member: can't delete the list", assertFails(deleteDoc(doc(other, "lists/l-0001"))));
await t("member: can leave", assertSucceeds(updateDoc(doc(other, "lists/l-0001"), { members: ["alice"], "people.bob": deleteField(), up: now })));
await t("left: can't read it any more", assertFails(getDoc(doc(other, "lists/l-0001/items/i1"))));
await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), "invites/" + TOK2), { kind: "list", from: "alice", name: "Alice", list: "l-0001", exp: now - 1000, at: now - 864e5 }); });
await t("join: an expired invite lets nobody in", assertFails(updateDoc(doc(carol, "lists/l-0001"), { members: arrayUnion("carol"), via: TOK2 })));
// removing someone retires the links: they can't come back with the one they used
await t("rejoin: Bob joins again with the link", assertSucceeds(updateDoc(doc(other, "lists/l-0001"), { members: arrayUnion("bob"), "people.bob": { n: "Bob" }, via: TOK, up: now })));
await t("owner: removes Bob and moves the generation on", assertSucceeds(updateDoc(doc(me, "lists/l-0001"), { members: ["alice"], "people.bob": deleteField(), gen: 1 })));
await t("rejoin: the old link no longer works for Bob", assertFails(updateDoc(doc(other, "lists/l-0001"), { members: arrayUnion("bob"), "people.bob": { n: "Bob" }, via: TOK })));
await t("member: can't reset the generation", assertSucceeds(env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), "lists/l-0001"), { members: ["alice", "carol"], "people.carol": { n: "Carol" } }))).then(() => assertFails(updateDoc(doc(carol, "lists/l-0001"), { gen: 0 }))));
await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), "invites/" + "D".repeat(32)), { kind: "list", from: "dave", name: "Dave", list: "l-0001", gen: 1, exp: now + 864e5, at: now }); });
await t("join: a link from someone not in the list lets nobody in", assertFails(updateDoc(doc(other, "lists/l-0001"), { members: arrayUnion("bob"), via: "D".repeat(32) })));
await t("member: can't wipe everyone's name tags", assertFails(updateDoc(doc(carol, "lists/l-0001"), { people: deleteField() })));
await t("owner: removes people", assertSucceeds(updateDoc(doc(me, "lists/l-0001"), { members: ["alice"], "people.carol": deleteField() })));
await t("owner: deletes the list", assertSucceeds(deleteDoc(doc(me, "lists/l-0001"))));
// watchers
await t("watch: make your own page", assertSucceeds(setDoc(doc(me, "watch/alice"), { watchers: [], people: {}, name: "Alice", share: "floors", up: now })));
await t("watch: can't be created with watchers already on it", assertFails(setDoc(doc(other, "watch/bob"), { watchers: ["alice"], people: {} })));
await t("watch: not someone else's", assertFails(setDoc(doc(other, "watch/alice"), { watchers: ["bob"] })));
await t("watch: can't add a watcher yourself (they must accept)", assertFails(updateDoc(doc(me, "watch/alice"), { watchers: ["bob"] })));
await t("watch: invite for your own page", assertSucceeds(setDoc(doc(me, "invites/" + TOKW), { kind: "watch", from: "alice", name: "Alice", watch: "alice", exp: now + 864e5, at: now })));
await t("watch: invite for someone else's page refused", assertFails(setDoc(doc(other, "invites/" + "X".repeat(32)), { kind: "watch", from: "bob", name: "Bob", watch: "alice", exp: now + 864e5, at: now })));
await t("watch: others can't read it", assertFails(getDoc(doc(other, "watch/alice"))));
await t("watch: accept with the invite", assertSucceeds(updateDoc(doc(other, "watch/alice"), { watchers: arrayUnion("bob"), "people.bob": { n: "Bob" }, via: TOKW })));
await t("watch: the watcher reads it", assertSucceeds(getDoc(doc(other, "watch/alice"))));
await t("watch: the watcher can find who they watch", assertSucceeds(getDocs(query(collection(other, "watch"), where("watchers", "array-contains", "bob")))));
await t("watch: the watcher can't change the numbers", assertFails(updateDoc(doc(other, "watch/alice"), { week: { held: 99 } })));
await t("cheer: a watcher sends one", assertSucceeds(setDoc(doc(other, "watch/alice/cheers/c1"), { from: "bob", name: "Bob", text: "Nice going", at: now })));
await t("cheer: not in someone else's name", assertFails(setDoc(doc(other, "watch/alice/cheers/c2"), { from: "carol", name: "Carol", text: "x", at: now })));
await t("cheer: strangers can't", assertFails(setDoc(doc(carol, "watch/alice/cheers/c3"), { from: "carol", name: "Carol", text: "x", at: now })));
await t("cheer: only the owner reads them", assertSucceeds(getDocs(collection(me, "watch/alice/cheers"))));
await t("cheer: the sender can't read them back", assertFails(getDocs(collection(other, "watch/alice/cheers"))));
await t("watch: owner updates the week", assertSucceeds(updateDoc(doc(me, "watch/alice"), { week: { id: "w-2026-10-12", held: 3, total: 5 }, up: now })));
await t("watch: owner removes a watcher", assertSucceeds(updateDoc(doc(me, "watch/alice"), { watchers: [], "people.bob": deleteField() })));
await t("watch: owner removes a watcher and moves the generation on", assertSucceeds(updateDoc(doc(me, "watch/alice"), { gen: 1 })));
await t("watch: the old link no longer works", assertFails(updateDoc(doc(other, "watch/alice"), { watchers: arrayUnion("bob"), "people.bob": { n: "Bob" }, via: TOKW })));
await t("watch: removed watcher can't read", assertFails(getDoc(doc(other, "watch/alice"))));

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

# Compass: publish it with Google sign-in

Compass is a static web app. Firebase (free "Spark" plan) handles **Google sign-in** and stores each person's data privately under their Google account. Firebase Hosting serves the app at `https://YOUR-PROJECT.web.app`, and people can add it to their iPhone home screen or install it on a laptop.

Plan on about 20 minutes the first time. Nothing here costs money at personal scale.

```
compass-web/
├─ public/                 ← the website that gets published
│  ├─ index.html           ← the whole app
│  ├─ firebase-config.js   ← paste your Firebase settings here (step 4)
│  ├─ manifest.webmanifest ← makes it installable as an app
│  ├─ icons/
│  └─ vendor/firebase.js   ← Google's Firebase SDK, bundled (no CDN needed)
├─ firestore.rules         ← each person can read and write only their own data
├─ firebase.json           ← hosting + rules settings
└─ .firebaserc             ← which Firebase project to deploy to
```

---

## 1. Create a Firebase project

1. Go to <https://console.firebase.google.com> and sign in with your Google account.
2. **Create a project** → name it (for example `compass-ayush`) → turn Google Analytics **off** → **Create**.
3. Note the **Project ID** shown under the name. You'll need it in step 5.

## 2. Turn on sign-in (Google and email)

1. In the left panel, open **Security → Authentication**. If you see a **Get started** button, click it.
   (Older consoles call this section **Build → Authentication**.)
2. Open the **Sign-in method** tab → under **Sign-in providers**, click **Google** (or **Add new provider → Google**) → switch **Enable** on.
3. In the same panel, set **Public-facing name for project** to `Compass` and choose your **Support email for project** → **Save**.
   This name is what people see on Google's "Choose an account" screen. If you don't see the name field, set it later under the gear icon → **Project settings → General → Public-facing name**.
4. **Email sign-in (for people without Google):** still under **Sign-in method** → **Add new provider → Email/Password** → switch **Email/Password** on (leave *Email link (passwordless sign-in)* off: the free plan only sends 5 of those a day) → **Save**.
   Optional: **Templates** tab → *Password reset* and *Email address verification* → set the sender name to `Compass`. The free plan sends up to 150 password-reset and 1,000 verification emails a day.

## 3. Create the database

1. In the left panel, open **Databases & Storage → Firestore** → **Create database**.
   (Older consoles call this **Build → Firestore Database**.)
2. Choose a location close to you. It can't be changed later.
3. Choose **Start in production mode** → **Create**. The rules in this project replace the defaults when you deploy.

## 4. Connect the app to your project

1. Click the gear icon → **Project settings** → scroll to **Your apps** → click the **Web** icon `</>`.
2. Nickname `Compass`. Leave "Firebase Hosting" unticked. Click **Register app**.
3. Firebase shows a `firebaseConfig = { … }` block. Copy the values into **`public/firebase-config.js`**, replacing every `PASTE_…`.

These values are meant to be public. What protects your data is `firestore.rules`, not this key.

## 5. Publish (pick one route)

### Route A: Firebase Hosting (recommended)

You need [Node.js 18 or newer](https://nodejs.org) on a Mac or PC. In a terminal, from the `compass-web` folder:

```bash
npx firebase-tools login                 # opens Google sign-in in your browser
npx firebase-tools use --add             # pick your project, alias it "default"
npx firebase-tools deploy                # publishes the app AND the database rules
```

The last command prints your address. This project publishes to **`https://life-compass.web.app`** (set by `"site"` in `firebase.json`). Remove that line to publish to `https://YOUR-PROJECT-ID.web.app` instead. Open it and sign in with Google.

To update later, edit the files and run `npx firebase-tools deploy` again.

### Route B: no terminal (Netlify Drop)

1. Go to <https://app.netlify.com/drop> and drag the **`public`** folder onto the page. You'll get an address like `https://random-name.netlify.app`. Create a free Netlify account to keep it.
2. Firebase console → **Authentication → Settings → Authorized domains → Add domain** → paste that address without `https://`.
3. Firebase console → **Firestore Database → Rules** tab → replace everything with the contents of `firestore.rules` → **Publish**.

On route B, sign-in uses a pop-up window. If a phone browser blocks it, allow pop-ups for the site.

## 6. Put it on your phone and laptop

- **iPhone (Safari):** open the address → Share → **Add to Home Screen**.
- **Android (Chrome):** menu → **Install app**.
- **Laptop (Chrome or Edge):** click the install icon in the address bar.

Sign in with the same Google account everywhere and your data stays in sync. It also works offline and syncs when you reconnect.

## 7. Bring over your data from the Claude version

1. In the Claude version: **Compass tab → Your data → Export**. This saves a `compass-YYYY-MM-DD.json` file.
2. In the published app: **Compass tab → Your data → Import** → choose that file.

Your setup, weeks, people and theme come across.

---

## What's different from the Claude version

| Feature | Claude version | Published app |
|---|---|---|
| Sign-in | Claude account | **Google account** |
| Who can use it | People in your Claude organization | **Anyone with the link and a Google account** |
| Setup, components, floors, review, themes | ✓ | ✓ |
| Rule-based suggestions | ✓ | ✓ |
| "Tailor with Claude" and coaching notes | ✓ | not included, because they run on Claude |
| Google Calendar | Adds events directly (once the connector works) | Opens Google Calendar with each block pre-filled as a repeating event |
| Works offline | No | Yes |

## 8. Check-in reminders (optional, free)

Compass can send **at most one evening check-in a day** (skipped on days you've already opened it) and a **Sunday review** nudge. They're sent by a tiny scheduler on Cloudflare Workers' free plan; alerts for individual floors come from the calendar export instead. Until you do this, the Reminders section stays hidden.

You need a free Cloudflare account. From the repo folder:

```bash
cd worker
npm install
npm run keys                       # makes the push keys; prints a PRIVATE key once
npx wrangler login                 # opens the browser to sign in to Cloudflare
npx wrangler secret put VAPID_PRIVATE   # paste the private key it printed
```

Then give the Worker read/write access to the `notify` collection with a Firebase service account:

1. Firebase console → ⚙ **Project settings** → **Service accounts** → **Generate new private key**. A `.json` file downloads. Keep it private; don't commit it.
2. `npx wrangler secret put FIREBASE_SA < path/to/that-file.json`
3. In `worker/wrangler.toml`, set `VAPID_SUBJECT` to `mailto:` plus your email (push services use it if something goes wrong).
4. Deploy both parts:
   ```bash
   npx wrangler deploy                # the scheduler, runs every minute
   cd .. && npx firebase-tools deploy # the app (it now knows the public key) and the database rules
   ```

Open Compass → **Compass** tab → **Reminders** → **Turn on reminders**. On iPhone, add Compass to your Home Screen first (Safari → Share → Add to Home Screen) and turn reminders on from that icon; iPhone only allows notifications for web apps opened that way. Watch the scheduler with `cd worker && npm run tail`.

**How far the free plan goes.** Each run may use 10 ms of CPU, which is about 8 reminders a minute, or roughly 11,000 a day. People who pick the same minute are served over the following minutes, so a few hundred people sharing one time still get theirs within about a minute or two each. The other ceiling is Firestore's free quota (50,000 reads and 20,000 writes a day), which the app itself already uses: reminders add only about 2 reads and 2 writes per person per day, so the app's own use will run out first. Beyond either limit, Workers Paid ($5/month) lets you set `PER_RUN = "200"` in `wrangler.toml`, and extra Firestore use costs cents per 100,000 operations.

## 9. Protect your free quota (recommended once others use it)

Anyone who signs in could, in theory, write data in a loop and use up the free daily quota for everyone. Two layers stop that:

1. **Database rules** (already in `firestore.rules`): each account can only write the few documents Compass uses, reminder and feedback entries are size-checked, and nobody can read anyone else's data. They go live with `npx firebase-tools deploy`; if a rule has a typo the deploy is refused and the old rules stay.
2. **App Check** proves requests come from your copy of Compass:
   - Google Cloud console → **reCAPTCHA** → **Create key** (type: Website, domain `life-compass.web.app` only; never add `localhost` to this key). Copy the key id.
   - Firebase console → **App Check** → your web app → **reCAPTCHA Enterprise** → paste the key → Save.
   - Put the same key in `public/firebase-config.js` as `window.COMPASS_APPCHECK_SITE_KEY` and deploy.
   - In the same App Check screen, set the token time to live to **7 days** (fewer checks, which keeps you inside reCAPTCHA's free monthly allowance).
   - Testing on your computer (`localhost`): open the browser console once; Compass prints an *App Check debug token*. Add it under App Check → your web app → ⋮ → **Manage debug tokens**. Keep it private.
   - Watch App Check → **Metrics** for a day or two. When almost all requests show as verified, press **Enforce** for Cloud Firestore. (The reminders Worker uses a service account, so it is unaffected.)

## 10. Your dashboard: usage, reminders health, feedback, errors

Open **life-compass.web.app/stats** for one page with:

- **Usage**: daily and weekly active accounts, new sign-ups, how many finish setup, which features people use, and how many weeks people have been using Compass. These are anonymous tallies: each account adds 1 the first time something happens in a day or week, and the tallies hold numbers only (no ids, names or entries).
- **Reminders health**: whether the Cloudflare Worker checked in recently, how many reminders went out or failed, and its last error. The Worker writes this every 10 minutes.
- **Errors** from people's devices, grouped by message, and **feedback** notes, newest first.

It's readable only by you. One-time setup:

1. Open the page and sign in. It shows your user id.
2. Firebase console → **Firestore** → **Start collection** → name it `admins` → document id: that user id → add any field (e.g. `at` = `1`) → Save.
3. Refresh the page.

Nobody can create an `admins` document from the app; only you, in the console.

## 11. Automatic tests and deploys (GitHub)

Every push to GitHub runs all the tests in `.github/workflows/ci.yml`: the app in a real browser at phone, small-phone, dark-mode and desktop sizes, the database rules against Google's Firestore emulator, and the reminders Worker. A push to `main` that passes is then **deployed automatically** (app + rules), so a broken change never goes live. You can watch runs under the repo's **Actions** tab, and a red ✗ appears next to the commit if anything fails.

To turn on the automatic deploy (until then, tests still run and you deploy by hand):

1. Google Cloud console → **IAM & Admin** → **Service accounts** (project `compass-ayush`) → **Create service account**, name it `github-deploy`, and give it the roles **Firebase Admin** and **Service Usage Consumer**. Then open it → **Keys** → **Add key** → **JSON**. A file downloads.
2. GitHub → your repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Name: `FIREBASE_SERVICE_ACCOUNT`. Value: paste the whole JSON file. Save, then delete the downloaded file.
   If a deploy ever fails with a permission error, the Actions log names the missing role; add it to the same service account.
3. From then on just `git push`. You no longer need to run `npx firebase-tools deploy` yourself.

Run the tests on your computer: `npm install && npx playwright install chromium && npm test` (the browser suites), `npm run test:rules` (needs Java), `npm run test:worker`.

## 12. Backups (nightly, encrypted)

Every night `.github/workflows/backup.yml` saves the **whole database** (everyone's data, reminders, feedback, tallies) as one encrypted file and keeps the last **30 days** under the repo's **Actions → Backup** runs. Each person can also download their own copy in the app; this one is for you, if something goes wrong for everyone at once.

**Turn it on (once):**
1. Make a long passphrase (at least 20 characters; a few random words is good) and **store it in your password manager**. Without it the backups can't be opened, by anyone, including you.
2. GitHub → repo → **Settings → Secrets and variables → Actions → New repository secret**: name `BACKUP_PASSPHRASE`, value: the passphrase. (It reuses `FIREBASE_SERVICE_ACCOUNT` from section 11.)
3. **Actions → Backup → Run workflow** to make the first one now. A green run with a `compass-backup-…` file under **Artifacts** means it works. GitHub emails you if a nightly run fails.

The repo is public, so anyone signed in to GitHub can download these files. They're encrypted with AES-256 using a key derived from your passphrase, so they're useless without it. A backup reads every document once, a few thousand reads a night at your size, well inside the free quota.

**Restore** (on your computer, from the repo folder):
1. Download the artifact from the run you want and unzip it to get `compass-YYYY-MM-DD.cbk`.
2. You need a service-account key: Firebase console → ⚙ **Project settings → Service accounts → Generate new private key**. Keep it outside the repo and delete it when you're done.
3. Look first; nothing is written without `--yes`:
   ```bash
   npm install
   export GOOGLE_APPLICATION_CREDENTIALS=~/Downloads/compass-key.json
   export BACKUP_PASSPHRASE='your passphrase'
   npm run restore -- compass-2026-10-03.cbk                       # what's inside
   npm run restore -- compass-2026-10-03.cbk --uid THEIR_UID       # one person, dry run
   npm run restore -- compass-2026-10-03.cbk --uid THEIR_UID --yes # do it
   npm run restore -- compass-2026-10-03.cbk --all --yes           # everything
   ```
   A restore puts back every document in the backup as it was. Documents created after the backup are left alone. A person's user id is shown in Firebase → Authentication → Users.

## Troubleshooting

- **"This address isn't allowed to sign in yet"**: add the domain under Authentication → Settings → Authorized domains. Only your project's own `PROJECT-ID.web.app` and `PROJECT-ID.firebaseapp.com` are allowed automatically; extra sites like `life-compass.web.app` must be added.
- **"Google sign-in isn't turned on"**: redo step 2.
- **"Your database is refusing saves"**: the rules weren't published. Run `npx firebase-tools deploy --only firestore:rules` (route A) or paste them in the console (route B).
- **Blank page saying "Almost there"**: `firebase-config.js` still has `PASTE_…` values.
- **Custom domain** (like `compass.yourname.com`): Hosting → Add custom domain, then add it to Authorized domains.

## Trying changes without redeploying

You don't need to redeploy, or clear cookies, to see a change.

- **Setup keeps its place.** If you're partway through setup, reloading or redeploying picks up on the same step with your edits. To run setup again after finishing it, use **Compass tab → Start over → Run setup**. Your logs are kept.
- **Run it on your computer.** From the repo folder:
  ```bash
  git pull
  npx live-server public --port=5173
  ```
  This opens http://localhost:5173 and reloads the page by itself whenever the files change, including right after a `git pull`. Google sign-in works on `localhost`. If it says the address isn't allowed, add `localhost` under Firebase → Security → Authentication → Settings → Authorized domains. It uses your real account and data.
- **Deploy only when you're happy:** push to GitHub; it deploys once the tests pass (section 11). By hand: `npx firebase-tools deploy`.

## For developers

- Rebuild the bundled SDK after changing `src/firebase.js`: `npm install && npm run build:sdk`.
- Data lives at `users/{uid}/docs/{docId}`, with docs `profile`, `settings`, `people` and one per week (`w-YYYY-MM-DD`, Monday of that week). Reminder settings live at `notify/{uid}` (top level, so the Worker can find due ones with one indexed query on `nextEve` / `nextRev`).
- Sync: each doc keeps a *base* (the last version this device and the server agreed on, saved locally). Saves run in a Firestore transaction that merges base, this device and the server three ways; counters (any map named `c`) add up; offline edits wait on the device and go out when it's back online. Every save carries a `_w` marker so a save whose reply was lost is never applied twice.
- The app shell is cached by `public/sw.js` (network-first for pages), so Compass opens offline.
- Updates: an open copy of Compass checks every 30 minutes (and when it comes back to the foreground) whether the deployed page differs, and offers **Reload**. `DATA_V` in `index.html` is the shape of saved data: **raise it when a change makes old code unsafe to save with** (renamed or restructured fields). Copies running older code then stop saving, keep edits on the device, and ask to reload; after the reload the kept edits sync.
- Pausing a floor stores `paused` (the Monday it paused from) and, after resuming, `pauses: [[from, to), …]`, so past weeks still count it and paused weeks don't.
- Anonymous tallies: `stats/d-YYYY-MM-DD` and `stats/w-<Monday>`, one field per event; rules allow only +1 to one known field per write. Which tallies an account already counted is kept in its own `settings.seen`.
- Tests live in `tests/`: `tests/e2e/*.js` drive the app with a stand-in Firebase (`mockfb.js`, `mockfb2.js` for two devices), `tests/rules/` checks `firestore.rules`, `worker/test/` checks the Worker.
- The reminders Worker is in `worker/`: `src/plan.js` decides, `src/push.js` encrypts (RFC 8291) and signs (VAPID) with WebCrypto only, `src/firestore.js` talks to Firestore's REST API.
- Firebase SDK 12.19.0, bundled with esbuild.

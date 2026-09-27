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

## 2. Turn on Google sign-in

1. In the left panel, open **Security → Authentication**. If you see a **Get started** button, click it.
   (Older consoles call this section **Build → Authentication**.)
2. Open the **Sign-in method** tab → under **Sign-in providers**, click **Google** (or **Add new provider → Google**) → switch **Enable** on.
3. In the same panel, set **Public-facing name for project** to `Compass` and choose your **Support email for project** → **Save**.
   This name is what people see on Google's "Choose an account" screen. If you don't see the name field, set it later under the gear icon → **Project settings → General → Public-facing name**.

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

## Troubleshooting

- **"This address isn't allowed to sign in yet"**: add the domain under Authentication → Settings → Authorized domains. Only your project's own `PROJECT-ID.web.app` and `PROJECT-ID.firebaseapp.com` are allowed automatically; extra sites like `life-compass.web.app` must be added.
- **"Google sign-in isn't turned on"**: redo step 2.
- **"Your database is refusing saves"**: the rules weren't published. Run `npx firebase-tools deploy --only firestore:rules` (route A) or paste them in the console (route B).
- **Blank page saying "Almost there"**: `firebase-config.js` still has `PASTE_…` values.
- **Custom domain** (like `compass.yourname.com`): Hosting → Add custom domain, then add it to Authorized domains.

## For developers

- Rebuild the bundled SDK after changing `src/firebase.js`: `npm install && npm run build:sdk`.
- Data lives at `users/{uid}/docs/{docId}`, with docs `profile`, `settings`, `people` and one per week (`w-YYYY-MM-DD`, Monday of that week).
- Firebase SDK 12.19.0, bundled with esbuild.

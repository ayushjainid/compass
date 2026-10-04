// Firebase web app settings for the "compass-ayush" project.
// These values are safe to publish: access to your data is controlled by firestore.rules, not by this key.
// (`self.` works in pages and in the service worker, which reads the Worker address below.)
// measurementId is here for completeness; Compass does not load Google Analytics.
self.COMPASS_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDQj13lOxUPHQGsJGdXFt4wE1uoDH5V3n8",
  authDomain: "life-compass.web.app",
  projectId: "compass-ayush",
  storageBucket: "compass-ayush.firebasestorage.app",
  messagingSenderId: "21302101961",
  appId: "1:21302101961:web:4d6d1fe1f1a91813370a18",
  measurementId: "G-MNRXLWFC2T"
};

// Microsoft To Do import (optional): the Application (client) ID of a free Microsoft app registration.
// Leave empty to hide the Connect button; the Outlook CSV route still works. It is public by design (no secret).
self.COMPASS_MS_CLIENT_ID = "";

// Check-in reminders (optional): the public VAPID key from `cd worker && npm run keys`. Empty hides Reminders.
self.COMPASS_VAPID_PUBLIC = "BOcXXvYX3OcbZ5JOXVuoGclRozkO4kdSUbugFrDZ7oFcTcp3iRYYfwX3anMI0UbUJjd7aglcOkX4bAybjTIaLRY";

// App Check (optional, recommended once you have users): a reCAPTCHA Enterprise site key, so only this app
// can use your database quota. See README → "Protect your free quota". Empty turns it off.
self.COMPASS_APPCHECK_SITE_KEY = "6LfMu90tAAAAANaiYHolKCpG9UgV-Ml0BL3mCiJ4";

// Your reminders Worker's address (it also serves the live calendar feed and the buttons on reminders),
// e.g. "https://compass-reminders.yourname.workers.dev". Shown by `cd worker && npx wrangler deploy`.
// Empty hides the live calendar option and the reminder buttons.
self.COMPASS_WORKER_URL = "";

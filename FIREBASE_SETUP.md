# Firebase Analytics Setup

## 1. Open Firebase Console
https://console.firebase.google.com/

## 2. Create project
- Click Create a project.
- Name it `Moin Routine App`.
- Turn Google Analytics ON.
- Choose/create an Analytics account.
- Finish project creation.

## 3. Add a Web app
- Open Project Overview.
- Click the Web icon `</>`.
- Nickname: `Moin Routine Web`.
- Do not enable Firebase Hosting.
- Register app.

## 4. Copy Firebase config
Firebase shows a `firebaseConfig` object containing:
- apiKey
- authDomain
- projectId
- storageBucket
- messagingSenderId
- appId
- measurementId

## 5. Paste it into the app
Open:

`src/firebase.js`

Replace every `PASTE_..._HERE` value with the matching Firebase value.

Do NOT paste a service-account private key.

## 6. Install dependencies
```bash
npm install
```

## 7. Test locally
```bash
npm run dev
```

Open DevTools -> Console.
You should see:

`[Firebase] Analytics initialized.`

## 8. Push to GitHub
```bash
git add .
git commit -m "Add Firebase Analytics"
git push origin main
```

## 9. Check users
Firebase Console -> Analytics.

You can see usage such as active users, sessions, devices, countries, and events.

Custom events already included:
- app_opened
- habit_completed
- habit_unchecked
- theme_toggle_clicked
- analytics_opened
- achievements_opened
- profile_opened
- backup_opened
- reminders_opened

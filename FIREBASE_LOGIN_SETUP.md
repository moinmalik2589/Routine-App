# Firebase Login Setup

This app now requires a Firebase account before the routine screen is available.

## 1. Firebase Web configuration

Open `src/firebase.js` and paste your Firebase Web App configuration into
`firebaseConfig`.

Only this one file is used by Analytics, Authentication and Firestore.

## 2. Enable Email/Password Authentication

Firebase Console:

Authentication → Get started → Sign-in method → Email/Password → Enable → Save

## 3. Create Firestore

Firebase Console:

Firestore Database → Create database

Choose the region you want and create the database.

## 4. Firestore rules

Open:

Firestore Database → Rules

Replace the rules with the contents of `firestore.rules`, then click Publish.

These rules allow each signed-in user to read and update only their own user
profile. Passwords are never stored in Firestore.

## 5. Run locally

```bash
npm install
npm run dev
```

Create a new account from the first screen.

## 6. Where user details appear

Authentication → Users:
- UID
- Email
- Created date
- Last sign-in
- Email verification state

Firestore Database → Data → users → USER_UID:
- displayName
- email
- uid
- accountStatus
- subscriptionStatus
- createdAt
- updatedAt
- lastLoginAt
- app
- platform

## 7. Deploy

Push to the main branch and keep GitHub Pages configured to use GitHub Actions.

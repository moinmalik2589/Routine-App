import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported, logEvent } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: "AIzaSyAPBLsOF5mVtVaDY_b44RRcKI0es793Coc",
  authDomain: "moin-malik-routine-app.firebaseapp.com",
  projectId: "moin-malik-routine-app",
  storageBucket: "moin-malik-routine-app.firebasestorage.app",
  messagingSenderId: "129745587104",
  appId: "1:129745587104:web:e8a4ade1a3138b1c1772c5",
  measurementId: "G-CBRTQGQGBQ"
};

let analytics = null;
let ready = false;

function configured() {
  return !firebaseConfig.apiKey.startsWith('AIzaSyAPBLsOF5mVtVaDY_b44RRcKI0es793Coc')
    && !firebaseConfig.appId.startsWith('1:129745587104:web:e8a4ade1a3138b1c1772c5')
    && !firebaseConfig.measurementId.startsWith('G-CBRTQGQGBQ');
}

export async function initFirebaseAnalytics() {
  if (!configured()) {
    console.info('[Firebase] Add your config in src/firebase.js');
    return false;
  }

  try {
    if (!(await isSupported())) return false;
    const app = initializeApp(firebaseConfig);
    analytics = getAnalytics(app);
    ready = true;
    logEvent(analytics, 'app_opened');
    console.info('[Firebase] Analytics initialized.');
    return true;
  } catch (error) {
    console.error('[Firebase] Analytics failed:', error);
    return false;
  }
}

export function trackEvent(name, params = {}) {
  if (!ready || !analytics) return;
  try {
    logEvent(analytics, name, params);
  } catch (error) {
    console.warn('[Firebase] Event failed:', name, error);
  }
}

import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAnalytics,
  isSupported as analyticsIsSupported,
  logEvent,
} from 'firebase/analytics';

export const firebaseConfig = {
  apiKey: "AIzaSyAPBLsOF5mVtVaDY_b44RRcKI0es793Coc",
  authDomain: "moin-malik-routine-app.firebaseapp.com",
  projectId: "moin-malik-routine-app",
  storageBucket: "moin-malik-routine-app.firebasestorage.app",
  messagingSenderId: "129745587104",
  appId: "1:129745587104:web:e8a4ade1a3138b1c1772c5",
  measurementId: "G-CBRTQGQGBQ"
};

export function firebaseConfigured() {
  const required = [
    firebaseConfig.apiKey,
    firebaseConfig.authDomain,
    firebaseConfig.projectId,
    firebaseConfig.appId,
  ];

  return required.every(
    (value) => value && !String(value).startsWith('PASTE_'),
  );
}

export function getFirebaseApp() {
  if (!firebaseConfigured()) return null;
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

let analytics = null;

export async function initFirebaseAnalytics() {
  const app = getFirebaseApp();

  if (!app || !firebaseConfig.measurementId?.startsWith('G-')) {
    console.info('[Firebase] Analytics is not configured yet.');
    return false;
  }

  try {
    if (!(await analyticsIsSupported())) return false;

    analytics = getAnalytics(app);
    logEvent(analytics, 'app_opened');

    console.info('[Firebase] Analytics initialized.');
    return true;
  } catch (error) {
    console.warn('[Firebase] Analytics could not start.', error);
    return false;
  }
}

export function trackEvent(name, params = {}) {
  if (!analytics) return;

  try {
    logEvent(analytics, name, params);
  } catch (error) {
    console.warn(`[Firebase] Event "${name}" was not recorded.`, error);
  }
}

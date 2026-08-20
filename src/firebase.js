import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported, logEvent } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: 'PASTE_API_KEY_HERE',
  authDomain: 'PASTE_AUTH_DOMAIN_HERE',
  projectId: 'PASTE_PROJECT_ID_HERE',
  storageBucket: 'PASTE_STORAGE_BUCKET_HERE',
  messagingSenderId: 'PASTE_MESSAGING_SENDER_ID_HERE',
  appId: 'PASTE_APP_ID_HERE',
  measurementId: 'PASTE_MEASUREMENT_ID_HERE',
};

let analytics = null;
let ready = false;

function configured() {
  return !firebaseConfig.apiKey.startsWith('PASTE_')
    && !firebaseConfig.appId.startsWith('PASTE_')
    && !firebaseConfig.measurementId.startsWith('PASTE_');
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

import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import {
  firebaseConfigured as hasFirebaseConfig,
  getFirebaseApp,
} from '../firebase.js';

export const firebaseConfigured = hasFirebaseConfig();

export function firebaseServices() {
  const app = getFirebaseApp();

  if (!app) return null;

  return {
    app,
    auth: getAuth(app),
    firestore: getFirestore(app),
  };
}

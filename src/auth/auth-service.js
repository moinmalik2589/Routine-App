import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';

import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import { evaluateAccountAccess } from './access-policy.js';

export class AuthService {
  constructor(services, { cache = globalThis.localStorage } = {}) {
    this.auth = services?.auth;
    this.firestore = services?.firestore;
    this.cache = cache;
  }

  waitForUser() {
    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(this.auth, (user) => {
        unsubscribe();
        resolve(user);
      });
    });
  }

  async signup({ displayName, email, password, confirmPassword }) {
    const name = displayName?.trim();
    const cleanEmail = email?.trim().toLowerCase();

    if (!name) {
      throw new Error('Please enter your name.');
    }

    if (!cleanEmail) {
      throw new Error('Please enter your email address.');
    }

    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }

    if (password !== confirmPassword) {
      throw new Error('Passwords do not match.');
    }

    const credential = await createUserWithEmailAndPassword(
      this.auth,
      cleanEmail,
      password,
    );

    await updateProfile(credential.user, {
      displayName: name,
    });

    await setDoc(
      doc(this.firestore, 'users', credential.user.uid),
      {
        uid: credential.user.uid,
        displayName: name,
        email: credential.user.email,
        emailVerified: credential.user.emailVerified,
        role: 'user',
        accountStatus: 'active',
        subscriptionStatus: 'trial',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        app: 'Moin Routine',
        platform: 'web-pwa',
      },
      { merge: true },
    );

    // Verification is useful, but it does not prevent the user from
    // entering the app immediately after creating an account.
    try {
      await sendEmailVerification(credential.user);
    } catch (error) {
      console.warn('Verification email could not be sent.', error);
    }

    return credential.user;
  }

  async login(email, password) {
    const cleanEmail = email?.trim().toLowerCase();

    const credential = await signInWithEmailAndPassword(
      this.auth,
      cleanEmail,
      password,
    );

    await this.ensureUserProfile(credential.user);

    return credential.user;
  }

  async ensureUserProfile(user) {
    const userRef = doc(this.firestore, 'users', user.uid);
    const snapshot = await getDoc(userRef);
    const existing = snapshot.exists() ? snapshot.data() : {};

    const record = {
      uid: user.uid,
      displayName:
        existing.displayName ||
        user.displayName ||
        user.email?.split('@')[0] ||
        'Routine User',
      email: user.email || existing.email || '',
      emailVerified: user.emailVerified,
      role: existing.role || 'user',
      accountStatus: existing.accountStatus || 'active',
      subscriptionStatus: existing.subscriptionStatus || 'trial',
      createdAt: existing.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      app: 'Moin Routine',
      platform: 'web-pwa',
    };

    await setDoc(userRef, record, { merge: true });

    return {
      ...existing,
      ...record,
    };
  }

  resetPassword(email) {
    return sendPasswordResetEmail(
      this.auth,
      email.trim().toLowerCase(),
    );
  }

  logout() {
    return signOut(this.auth);
  }

  async access(user) {
    const record = await this.ensureUserProfile(user);
    const cachedAt = Date.now();

    this.cache?.setItem(
      'moin-access-cache',
      JSON.stringify({
        uid: user.uid,
        record,
        cachedAt,
      }),
    );

    return {
      ...evaluateAccountAccess(record, {
        online: true,
        cachedAt,
      }),
      record,
    };
  }

  cachedAccess(user) {
    try {
      const cached = JSON.parse(
        this.cache?.getItem('moin-access-cache'),
      );

      if (cached?.uid !== user.uid) {
        return {
          allowed: false,
          reason: 'reconnect-required',
        };
      }

      return {
        ...evaluateAccountAccess(cached.record, {
          online: false,
          cachedAt: cached.cachedAt,
        }),
        record: cached.record,
      };
    } catch {
      return {
        allowed: false,
        reason: 'reconnect-required',
      };
    }
  }
}

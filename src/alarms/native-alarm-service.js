import { createAlarmSpec } from './alarm-model.js';

/**
 * Browser/PWA alarm adapter.
 *
 * Native Android alarm scheduling used to live here through Capacitor.
 * The app is now web-first, so this adapter keeps the same public API
 * without importing native-only packages.
 */
export class NativeAlarmService {
  get available() {
    return false;
  }

  async permissionState() {
    if (!('Notification' in window)) {
      return 'unsupported';
    }

    return Notification.permission;
  }

  async requestPermission() {
    if (!('Notification' in window)) {
      return 'unsupported';
    }

    if (Notification.permission === 'granted') {
      return 'granted';
    }

    try {
      return await Notification.requestPermission();
    } catch (error) {
      console.warn('Notification permission request failed.', error);
      return 'denied';
    }
  }

  async schedule(activity, date, time) {
    // Native background alarms are intentionally unavailable in the web build.
    // Returning the normalized alarm spec keeps the rest of the app logic stable.
    return createAlarmSpec(activity, date, time);
  }

  async cancel() {
    return true;
  }

  async cancelAll() {
    return true;
  }

  async sync() {
    return true;
  }
}

export const nativeAlarmService = new NativeAlarmService();

import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

const CLOUD_SYNC_VERSION = 1;
const CHUNK_SIZE = 280_000;
const LAST_SYNC_PREFIX = 'moinRoutineCloudSyncAt:';

function chunkId(index) {
  return String(index).padStart(4, '0');
}

function splitText(value, size = CHUNK_SIZE) {
  const chunks = [];

  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size));
  }

  return chunks.length ? chunks : [''];
}

function localSyncKey(uid) {
  return `${LAST_SYNC_PREFIX}${uid}`;
}

export class CloudSyncService {
  constructor({ firestore, backupService }) {
    this.firestore = firestore;
    this.backupService = backupService;
    this.pushTimer = null;
    this.pushInFlight = null;
    this.restoring = false;
  }

  metaRef(uid) {
    return doc(
      this.firestore,
      'users',
      uid,
      'cloudSync',
      'meta',
    );
  }

  chunkRef(uid, index) {
    return doc(
      this.firestore,
      'users',
      uid,
      'cloudSync',
      'meta',
      'chunks',
      chunkId(index),
    );
  }

  localLastSync(uid) {
    return Number(localStorage.getItem(localSyncKey(uid)) || 0);
  }

  rememberSync(uid, timestamp) {
    localStorage.setItem(localSyncKey(uid), String(timestamp));
  }

  preferences() {
    return {
      streakStartDate:
        localStorage.getItem('moinRoutineStreakStartDate') || null,
      theme:
        localStorage.getItem('moinRoutineTheme') || null,
      accent:
        localStorage.getItem('moinRoutineAccent') || null,
      sound:
        localStorage.getItem('moinRoutineSound') || null,
      vibration:
        localStorage.getItem('moinRoutineVibration') || null,
    };
  }

  restorePreferences(preferences = {}) {
    const keys = {
      streakStartDate: 'moinRoutineStreakStartDate',
      theme: 'moinRoutineTheme',
      accent: 'moinRoutineAccent',
      sound: 'moinRoutineSound',
      vibration: 'moinRoutineVibration',
    };

    for (const [sourceKey, localKey] of Object.entries(keys)) {
      const value = preferences[sourceKey];

      if (value == null || value === '') continue;
      localStorage.setItem(localKey, value);
    }
  }

  async readRemote(uid) {
    const metaSnapshot = await getDoc(this.metaRef(uid));

    if (!metaSnapshot.exists()) {
      return null;
    }

    const meta = metaSnapshot.data();
    const chunkCount = Number(meta.chunkCount || 0);

    if (!chunkCount) {
      return null;
    }

    const parts = [];

    for (let index = 0; index < chunkCount; index += 1) {
      const snapshot = await getDoc(this.chunkRef(uid, index));

      if (!snapshot.exists()) {
        throw new Error(
          `Cloud backup is incomplete. Missing chunk ${index + 1}.`,
        );
      }

      parts.push(snapshot.data().data || '');
    }

    return {
      meta,
      payload: JSON.parse(parts.join('')),
    };
  }

  async restoreIfNewer(uid) {
    if (!navigator.onLine) {
      return {
        restored: false,
        reason: 'offline',
      };
    }

    const remote = await this.readRemote(uid);

    if (!remote) {
      return {
        restored: false,
        reason: 'no-cloud-backup',
      };
    }

    const remoteSavedAt = Number(
      remote.meta.clientSavedAt || 0,
    );

    if (
      remoteSavedAt &&
      remoteSavedAt <= this.localLastSync(uid)
    ) {
      return {
        restored: false,
        reason: 'local-is-current',
      };
    }

    this.restoring = true;

    try {
      this.restorePreferences(remote.payload.preferences);

      await this.backupService.importJson(
        JSON.stringify(remote.payload.backup),
      );

      this.rememberSync(
        uid,
        remoteSavedAt || Date.now(),
      );

      return {
        restored: true,
        savedAt: remoteSavedAt,
      };
    } finally {
      this.restoring = false;
    }
  }

  async pushNow(uid) {
    if (
      !uid ||
      !navigator.onLine ||
      this.restoring
    ) {
      return false;
    }

    if (this.pushInFlight) {
      return this.pushInFlight;
    }

    this.pushInFlight = this.writeSnapshot(uid)
      .finally(() => {
        this.pushInFlight = null;
      });

    return this.pushInFlight;
  }

  async writeSnapshot(uid) {
    const previousMeta = await getDoc(this.metaRef(uid));
    const previousChunkCount = previousMeta.exists()
      ? Number(previousMeta.data().chunkCount || 0)
      : 0;

    const backup = await this.backupService.exportObject();
    const clientSavedAt = Date.now();

    const serialized = JSON.stringify({
      version: CLOUD_SYNC_VERSION,
      backup,
      preferences: this.preferences(),
    });

    const chunks = splitText(serialized);

    await Promise.all(
      chunks.map((data, index) =>
        setDoc(
          this.chunkRef(uid, index),
          {
            index,
            data,
          },
        ),
      ),
    );

    if (previousChunkCount > chunks.length) {
      await Promise.all(
        Array.from(
          {
            length:
              previousChunkCount - chunks.length,
          },
          (_, offset) =>
            deleteDoc(
              this.chunkRef(
                uid,
                chunks.length + offset,
              ),
            ),
        ),
      );
    }

    await setDoc(
      this.metaRef(uid),
      {
        version: CLOUD_SYNC_VERSION,
        chunkCount: chunks.length,
        clientSavedAt,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    this.rememberSync(uid, clientSavedAt);

    return true;
  }

  schedulePush(uid, delay = 1200) {
    if (!uid || this.restoring) return;

    window.clearTimeout(this.pushTimer);

    this.pushTimer = window.setTimeout(() => {
      this.pushNow(uid).catch((error) => {
        console.warn('Cloud sync could not save.', error);
      });
    }, delay);
  }
}

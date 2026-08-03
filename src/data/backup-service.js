import { STORE_NAMES, APPLICATION_SCHEMA_VERSION } from './models.js';
export const BACKUP_FORMAT_VERSION = 1;
export class BackupService {
  constructor(adapter) { this.adapter = adapter; this.lastSafetyBackup = null; }
  async exportObject() { const stores = Object.fromEntries(await Promise.all(Object.values(STORE_NAMES).map(async (store) => [store, await this.adapter.getAll(store)]))); return { format: 'moin-routine-backup', formatVersion: BACKUP_FORMAT_VERSION, schemaVersion: APPLICATION_SCHEMA_VERSION, exportedAt: new Date().toISOString(), stores }; }
  async exportJson() { return JSON.stringify(await this.exportObject(), null, 2); }
  validate(value) { if (value?.format !== 'moin-routine-backup' || value.formatVersion !== BACKUP_FORMAT_VERSION || !value.stores) throw new Error('Unsupported or invalid routine backup.'); for (const store of Object.values(STORE_NAMES)) if (!Array.isArray(value.stores[store])) throw new Error(`Backup is missing ${store}.`); return value; }
  preview(value) { const backup = this.validate(typeof value === 'string' ? JSON.parse(value) : value); return { exportedAt: backup.exportedAt, schemaVersion: backup.schemaVersion, activities: backup.stores.activities.length, routineDays: backup.stores.dailyRoutines.length, completions: backup.stores.completions.length, profileName: backup.stores.profiles[0]?.displayName || '' }; }
  async importJson(json) { const backup = this.validate(JSON.parse(json)); this.lastSafetyBackup = await this.exportObject(); try { if (typeof this.adapter.replaceAll !== 'function') throw new Error('Storage adapter does not support safe atomic restore.'); await this.adapter.replaceAll(backup.stores); return this.preview(backup); } catch (error) { if (typeof this.adapter.replaceAll === 'function') await this.adapter.replaceAll(this.lastSafetyBackup.stores); throw error; } }
}

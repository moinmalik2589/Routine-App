import { RoutineRepository, resetDevelopmentDatabase } from './routine-repository.js';
import { createStorageAdapter } from './storage-factory.js'; import { BackupService } from './backup-service.js';

export const databaseAdapter = await createStorageAdapter();
export const routineService = new RoutineRepository(databaseAdapter);
export const backupService = new BackupService(databaseAdapter);
export async function deleteAllLocalData() { await databaseAdapter.destroy(); }
export { resetDevelopmentDatabase };

import { IndexedDbAdapter } from './indexeddb-adapter.js';
import { RoutineRepository, resetDevelopmentDatabase } from './routine-repository.js';

export const databaseAdapter = new IndexedDbAdapter();
export const routineService = new RoutineRepository(databaseAdapter);
export { resetDevelopmentDatabase };

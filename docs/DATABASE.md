# Offline database architecture

Phase 2 uses IndexedDB through `IndexedDbAdapter`. UI code depends only on `RoutineRepository`, allowing a future Capacitor SQLite adapter to implement the same persistence boundary without changing view code.

## Schema version 1

| Store | Key | Named model and purpose |
| --- | --- | --- |
| `metadata` | `key` | Schema version and migration metadata. |
| `settings` | `id` | User settings, including the `Asia/Kolkata` timezone and progress preference. |
| `activities` | `id` | Ordered activity definitions, enablement, notification choice, protected/system flags and soft-delete timestamp. |
| `dailyRoutines` | `date` | Immutable per-day activity-definition snapshots. Later edits never rewrite an existing day. |
| `completions` | `date:activityId` | Completion history, indexed by date and activity ID. |
| `alarmStates` | `date` | Daily enabled state plus disabled individual alarm IDs. |
| `fastingRanges` | `id` | Enabled configurable fasting ranges with inclusive start/end dates. |
| `prayerTimings` | `date` | Named prayer timing fields and their source identifier. |

## Lifecycle guarantees

- Startup creates missing version-1 stores and seeds defaults only when the relevant store is empty.
- Opening a date creates its routine, completion, alarm and prayer records once.
- Activity definitions are copied into a daily snapshot; existing days are never regenerated.
- Removing an activity is a soft delete. Existing daily snapshots and completion rows remain queryable.
- Migrations are incremental and idempotent. Normal startup never deletes the database.
- `resetDevelopmentDatabase(adapter)` exists for developer tooling/tests and is not exposed by the application UI.

## SQLite extension seam

The future native adapter should provide the operations currently exposed by `IndexedDbAdapter`: `open`, `transaction`, `get`, `getAll`, `put`, `delete`, `close`, and development-only `destroy`. Repository and UI behavior remain above that boundary.

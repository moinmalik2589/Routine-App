# Offline database architecture

The application uses `RoutineRepository` above `IndexedDbAdapter`. UI modules never issue IndexedDB calls directly, preserving the future Capacitor SQLite adapter seam.

## Versioning and schema integrity

- Application data schema: **2** (`APPLICATION_SCHEMA_VERSION`).
- Minimum physical IndexedDB version: **3** (`INDEXEDDB_PHYSICAL_VERSION`).
- Database name: `moin-routine` (`DATABASE_NAME`).

Physical version 3 is intentionally higher than the data schema. An early Phase 4 build could write metadata version 2 while a browser database lacked the new `profiles` store. Reopening physical version 2 could not fire `onupgradeneeded`, so the missing store was never created. Physical version 3 forces an authoritative upgrade that creates every missing required store without deleting existing stores or records.

After opening, `validateSchemaIntegrity()` checks all required store names. If a database is already at the minimum physical version but remains incomplete, the adapter closes that connection and performs one safe repair upgrade at the next physical version. Metadata schema 2 is written only after data migrations finish successfully.

The adapter shares one in-flight open promise, clears stale connections on `versionchange`/`close`, waits for explicit transaction completion, and retries a transaction at most once after a closing/stale connection error.

## Application schema version 2

| Store | Key | Model and purpose |
| --- | --- | --- |
| `metadata` | `key` | Schema version and migration timestamps. |
| `settings` | `id` | Small user/UI settings. |
| `profiles` | `id` | Location and prayer settings: Place ID/address, city, state, country, coordinates, IANA timezone, method, madhab, Sehri offset, adjustments, source, version and timestamp. |
| `activities` | `id` | Ordered activity definitions, schedules, time slots, protection state and soft deletion. |
| `dailyRoutines` | `date` | Immutable activity, occurrence and prayer-time snapshots for a date. |
| `completions` | `date:occurrenceId` | Independent occurrence completion history, indexed by date/activity. Legacy activity-level rows are retained. |
| `alarmStates` | `date` | Daily state and disabled occurrence notification IDs. |
| `fastingRanges` | `id` | Configurable inclusive fasting ranges. |
| `prayerTimings` | `date` | Reusable local prayer cache record with settings fingerprint and generation source. |

## Activity and occurrence models

An activity contains a named `schedule` and ordered `timeSlots`. Schedule types are daily, selected weekdays, weekly interval, monthly day, yearly month/day, one date, multiple dates, inclusive date range and none.

Each time slot has a stable ID, time, optional label, enabled state, notification state, minute offset and protected internal prayer key where applicable. When a date is first opened, applicable enabled slots become immutable named occurrences. Completion and progress use occurrence IDs, so multiple times per day are independent.

## Prayer cache and snapshot rules

- `adhan` calculates Fajr, Sunrise, Dhuhr, Asr, Maghrib and Isha locally.
- Coordinates resolve to an IANA timezone locally through `tz-lookup`.
- The cache fingerprint includes rounded latitude/longitude, location version, timezone, calculation method, madhab, all prayer adjustments and the Sehri offset.
- Current and upcoming months are warmed after profile save/startup; missing dates are calculated on demand.
- A confirmed profile change first calculates the replacement current/next-month cache, then activates the profile, removes only future rows belonging to the previous fingerprint, and refreshes eligible routine snapshots.
- Past daily snapshots never change. Today/future snapshots without completed occurrences may be regenerated. When completion exists, completed occurrence identity/time/history is retained and only uncompleted prayer-controlled occurrence times are updated without duplication.
- Profile activation rolls back to the previous valid profile if regeneration or snapshot refresh fails.

## Protected prayer definitions

`sehri`, `fajr`, `zohar`, `ashar`, `maghrib` and `isha` are canonical protected definitions. Startup reconciliation restores their names, schedules, prayer keys and system alarm mappings without changing historical snapshots or deleting user records. Repository calls may change only activity enabled state and protected-slot notification state; name, time, recurrence, deletion and protected mapping mutations are rejected.

## Version 1 → version 2 migration

- Adds the `profiles` store without resetting any existing store.
- Converts each legacy activity `defaultTime` into a stable first time slot and assigns a daily schedule.
- Adds occurrences to legacy daily snapshots.
- Copies legacy activity completion values into first-occurrence completion rows without deleting legacy rows.
- Embeds existing prayer records into their matching historical routine snapshots.
- Preserves alarm state, ordering, protected fields and soft-deletion timestamps.

Normal startup never deletes data. `resetDevelopmentDatabase(adapter)` remains development-only and absent from the UI.

## Development diagnostics

Development builds log only database name, physical version, application schema version, object-store names, connection state, repair status and active transaction count. Location/profile values are not logged. No reset control is exposed.

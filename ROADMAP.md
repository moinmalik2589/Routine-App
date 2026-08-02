# Moin Routine App Roadmap

## Phase 1 — Vite/Capacitor foundation and UI migration

Status: Complete

- [x] Inventory and inspect every existing project file.
- [x] Audit the legacy interface, behavior, data indexes, and `google.script.run` calls.
- [x] Create a Vite vanilla-JavaScript project and Capacitor Android shell.
- [x] Preserve the daily, monthly, and activity interfaces and interactions.
- [x] Replace Apps Script calls with a temporary named-object mock service.
- [x] Generate selectable years dynamically.
- [x] Replace fixed Ramadan checks with configurable mock fasting ranges.
- [x] Use Asia/Kolkata-safe date helpers in the migrated client.
- [x] Build and test the Phase 1 app.

## Phase 2 — IndexedDB persistence and activity management

Status: Complete

- [x] Replace memory-only mocks with an IndexedDB repository and named models.
- [x] Add schema version 1 migrations and seed-only-when-empty initialization.
- [x] Preserve daily definition snapshots and soft-deleted completion history.
- [x] Persist completion and alarm changes across reloads.
- [x] Calculate monthly and yearly progress from stored daily records.
- [x] Add activity add/edit/reorder/enable/disable/remove and notification controls.
- [x] Protect system prayer mappings from destructive changes.
- [x] Add persistence, activity lifecycle, progress, migration and timezone tests.

## Phase 3 — Authentication and account access

- [ ] Add Firebase Authentication (signup, login, logout, reset, verification).
- [ ] Add secure account-status checks for active, suspended, expired, and cancelled users.
- [ ] Define Firebase Security Rules and Cloud Functions admin boundary.
- [ ] Add an owner-only admin interface for account lifecycle actions.

## Phase 4 — Native storage and backup

- [ ] Add a Capacitor SQLite adapter implementing the repository boundary.
- [ ] Add JSON backup export/import with validation and versioning.

## Phase 5 — Prayer data and alarms

- [ ] Bundle offline prayer timing JSON and formalize its data model.
- [ ] Add configurable fasting-date ranges and a later calculation provider seam.
- [ ] Add Android local notifications/exact alarms and permission UX.
- [ ] Reschedule alarms after device restart.
- [ ] Protect system alarm configuration from user modification.

## Phase 6 — Production hardening and release

- [ ] Add migration, repository, authentication, rules, and alarm tests.
- [ ] Complete accessibility, responsive-device, offline, and timezone QA.
- [ ] Configure signed Android release builds and deployment documentation.
- [ ] Complete privacy, backup, recovery, and security review.

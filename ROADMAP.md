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
- [ ] Require city/location selection during signup, suggesting Ghaziabad, India by default without restricting users to Ghaziabad.
- [ ] Store `city`, `state`, `country`, `latitude`, `longitude`, IANA timezone, prayer calculation method, and madhab in the user profile.
- [ ] Use Google Places Autocomplete only for location search and coordinate selection; Google must not provide prayer timings.
- [ ] Allow manual city selection when location permission is denied, without requesting continuous background location access.
- [ ] Add a Profile Settings screen that allows location, timezone, calculation-method, and madhab changes.
- [ ] Restrict Google Places API keys appropriately for the Android and web applications.
- [ ] Add secure account-status checks for active, suspended, expired, and cancelled users.
- [ ] Define Firebase Security Rules and Cloud Functions admin boundary.
- [ ] Add an owner-only admin interface for account lifecycle actions.

## Phase 4 — Advanced scheduling, location and offline prayer calculation

Status: Complete — authorized Phase 4 scope was advanced scheduling, location setup and local prayer calculation.

- [x] Add nine activity schedule types and ordered multiple daily time slots.
- [x] Generate immutable daily occurrence snapshots and occurrence-level completion/progress history.
- [x] Add first-run location setup, foreground detection, manual fallback and profile settings.
- [x] Add restricted Google Places adapter boundary plus no-key development provider.
- [x] Calculate prayer times locally with `adhan` and resolve IANA timezones with `tz-lookup`.
- [x] Cache current/upcoming month prayer data with configuration fingerprints and on-demand generation.
- [x] Migrate schema 1 data to schema 2 without deleting legacy records.
- [x] Correct the Phase 4 migration regression with physical IndexedDB version 3, required-store integrity validation and safe repair upgrades.
- [x] Serialize database initialization, recover once from stale connections and prevent Home handlers from using a null/loading daily record.
- [x] Add latest-request Home loading, readable retry errors and non-blocking prayer-cache warming.
- [x] Correct city autocomplete so configured Google Places is live, while no-key development mode uses an honest multi-city mock/manual flow.
- [x] Recalculate and cache prayer data after confirmed coordinate or prayer-setting changes, with completion-safe current/future snapshot refresh.
- [x] Lock Sehri and prayer-driven activities in both Activity Management and repository validation.
- [x] Make the no-key development city catalog fully searchable/selectable, centralize mock/Google provider selection, surface Google configuration failures and report prayer rebuild results.
- [x] Repair browser-native debounce invocation, add owner-preserving timer wrappers, DOM binding teardown and browser-compatible autocomplete regression coverage.

## Phase 5 — Native storage and backup

- [ ] Add a Capacitor SQLite adapter implementing the repository boundary.
- [ ] Add JSON backup export/import with validation and versioning.

## Phase 6 — Production Android alarms

- [ ] Add Android local notifications/exact alarms and permission UX.
- [ ] Reschedule alarms after device restart.
- [ ] Protect system alarm configuration from user modification.

## Phase 7 — Production hardening and release

- [ ] Add migration, repository, authentication, rules, and alarm tests.
- [ ] Complete accessibility, responsive-device, offline, and timezone QA.
- [ ] Configure signed Android release builds and deployment documentation.
- [ ] Complete privacy, backup, recovery, and security review.

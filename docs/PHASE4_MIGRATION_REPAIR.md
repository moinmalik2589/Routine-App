# Phase 4 IndexedDB migration repair

## Affected state

The regression occurs when IndexedDB metadata reports application schema 2 but physical IndexedDB version 2 does not contain `profiles`. Because opening the same physical version does not trigger an upgrade transaction, normal `profiles` access throws `NotFoundError`.

The earlier adapter also allowed concurrent `open()` requests before `db` was assigned. A `versionchange` could close one connection while another caller attempted a transaction, producing `InvalidStateError`. Home then left `state.day` null while unguarded handlers dereferenced `.date`.

## Repair behavior

1. Open `moin-routine` at minimum physical version 3.
2. Inside `onupgradeneeded`, create only missing required stores and indexes.
3. Validate `objectStoreNames` after opening.
4. If anything is still missing, close the connection and perform one upgrade at `currentPhysicalVersion + 1`.
5. Preserve all existing stores and records; never delete or recreate the database.
6. Run idempotent application migration steps and write metadata schema 2 last.
7. Share one connection promise and retry only one stale/closing transaction.

The deterministic regression fixture creates physical version 2 with metadata 2, deliberately omits `profiles`, inserts activity and completion data, and verifies that startup adds `profiles` while retaining both records. A second fixture repairs a malformed database already at physical version 3 by upgrading it to version 4.

The subsequent location/prayer correction does not change the application or physical schema version. Flexible named-object profile records gain optional Place identity/address and Sehri-offset fields. Startup idempotently reconciles canonical protection for system prayer definitions while leaving every daily routine, completion, alarm, setting, fasting range and cached prayer record intact.

## Home recovery

Home waits for initialization and location readiness. It renders the daily record before warming two-month prayer cache in the background. A latest-request token prevents rapid date navigation from applying stale results. While loading, dependent controls are disabled and record-dependent handlers return safely. Recoverable failures replace the loading text with a readable error and Retry button.

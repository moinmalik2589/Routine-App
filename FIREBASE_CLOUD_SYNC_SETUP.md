# Firebase profile + cross-device sync

## Publish the updated Firestore rules

Firebase Console -> Firestore Database -> Rules

Replace the current rules with the contents of:

`firestore.rules`

Then click **Publish**.

Without these rules, the app cannot save the user's routine backup below their
Firebase user document.

## Where to change a user's display name

Recommended:

Firestore Database -> Data -> users -> USER_UID -> displayName

The app listens to that user document in real time, so changes appear while the
user is signed in.

The app also checks Firebase Authentication every minute and on login. If the
Authentication display name was changed externally, it is reconciled back into
the Firestore profile.

## Cross-device routine data

The app automatically stores a versioned backup under:

users/{uid}/cloudSync/meta

and chunk documents under:

users/{uid}/cloudSync/meta/chunks/

The backup includes the same stores used by the built-in Backup/Restore system:

- settings
- profile/location
- activities and schedules
- generated daily routines
- checkbox/completion history
- alarm state
- fasting ranges
- prayer timing cache
- metadata

It also syncs important local preferences such as the streak start date, theme,
accent, sound and vibration.

When the same account signs in on a different device, the newest cloud backup is
restored before the routine screen loads.

The app saves after changes, every 30 seconds while active, when it goes to the
background, and when the internet reconnects.

## Important

Each browser installation is tied to one Firebase user at a time. If a different
Firebase account signs in on the same browser, the old user's local IndexedDB is
cleared before the new user's cloud data is restored. This prevents one account
from seeing another account's routine history.

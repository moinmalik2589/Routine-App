# Google Play release checklist

## Internal testing
- Replace support/website placeholders; deploy Privacy Policy and account-deletion page.
- Configure restricted Firebase and Google keys; deploy Firestore rules and Cloud Functions; assign admin custom claims securely.
- Install JDK 17+, Android SDK/API 36 and accept licenses; configure a non-committed release keystore through `MOIN_KEYSTORE_*` environment variables.
- Build signed AAB, upload to Internal testing, complete Data Safety/content rating/app access/exact-alarm declarations, and test install/update/backup migration/alarm reboot behavior on physical Android devices.

## Closed testing
- Test required cohort/duration for the Play account; review pre-launch report, crashes, ANRs, accessibility and device compatibility.
- Verify Firebase suspension/expiry/offline access, map keys, foreground location denial, exact-alarm denial fallback and account deletion operations.

## Production
- Increment version code for every upload; retain signing key securely; review staged rollout, support inbox, monitoring and rollback plan.
- Do not claim publication until Play Console review and production release complete.

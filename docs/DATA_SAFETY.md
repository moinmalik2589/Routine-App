# Google Play Data Safety draft

- Account data: email, display name, user ID, authentication and verification status; collected for account management.
- App activity: account/subscription state and deletion request; collected for access control.
- Approximate/precise location: provided or detected only during location setup; used for city selection, timezone and local prayer calculations. Foreground only.
- Local routine data: activities, completion history, alarms, prayer cache and backups normally remain on-device. User-initiated backup sharing transfers data to the destination chosen by the user.
- Third parties/processors: Firebase Authentication/Firestore/Functions and Google Places/Maps when configured.
- Security: transport encryption by providers; Firebase Security Rules and admin custom claims; no service-account credentials in the app.
- Deletion: in-app local deletion and account deletion request flow.

Review every Play Console answer against the final deployed Firebase/Google configuration before submission.

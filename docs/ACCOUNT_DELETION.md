# Account deletion

In the app, open **User Profile → Privacy & Account → Request Account Deletion**. To erase device-only history, export any wanted backup and choose **Delete Local Data** separately. Website request placeholder: https://example.com/moin-routine/delete-account. Support placeholder: support@example.com.

The owner must deploy the callable deletion-request function, monitor requests, verify identity where necessary, delete the Firebase Authentication user and associated Firestore profile, and communicate completion. Audit/security records may follow the published retention policy.

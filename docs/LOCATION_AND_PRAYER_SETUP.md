# Location and offline prayer setup

## Development without Google

Leave `VITE_GOOGLE_PLACES_API_KEY` blank. Manual search then uses the deterministic Ghaziabad fallback, while location/profile, calculation and cache flows remain testable. Automated tests inject mock geolocation, reverse-geocoding and search providers.

## Google Places configuration

1. Enable **Places API (New)** in the intended Google Cloud project.
2. Create environment-specific API keys; do not reuse unrestricted keys.
3. Limit API targets to Places API (New).
4. For web development/hosting, apply exact HTTP-referrer restrictions.
5. For Android distribution, apply the package name `com.moinmalik.routine` and release signing-certificate restriction. If the REST surface cannot enforce the required Android restriction for the chosen deployment, route Places through an Android-native restricted integration before release—never ship an unrestricted key.
6. Put the appropriate restricted key in a local `.env` as `VITE_GOOGLE_PLACES_API_KEY`. Never commit `.env`.

Places is used only for autocomplete, place coordinates and confirming a nearby city after foreground detection. Prayer times never come from Google or another online prayer service.

## Location behavior

- First run suggests Ghaziabad, Uttar Pradesh, India.
- Detect My Location requests one foreground position only; no watcher or background permission is used.
- Permission denial leaves manual search fully usable.
- Coordinates map to IANA timezone locally using `tz-lookup`.
- Users confirm all detected/searched fields before saving and can later use Profile & Prayer Settings → Change Location.

## Prayer defaults

Ghaziabad defaults to Karachi calculation, Hanafi Asr and zero manual adjustments. Users can change method, madhab and per-prayer minute adjustments. `adhan` performs all daily calculations locally and IndexedDB supplies offline cache records.

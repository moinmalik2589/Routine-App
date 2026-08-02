# Location and offline prayer setup

## Provider design

The Vite/Capacitor client uses the Places API (New) REST autocomplete and place-details surfaces behind `GooglePlacesProvider`. This matches the existing vanilla-JavaScript adapter boundary and requests details only after selection. Autocomplete requests start after two characters, are debounced, discard stale responses and share a session token through the selected Place Details request.

Google supplies city identity and coordinates only. `tz-lookup` derives the IANA timezone locally and `adhan` calculates all prayer times locally.

## Development without Google

Leave `VITE_GOOGLE_PLACES_API_KEY` blank. The screen explicitly displays “Live city search requires a Google Places API key.” Development search then uses a separate deterministic mock containing Ghaziabad, Delhi, Mumbai, Bengaluru, Kolkata, Hyderabad and Lucknow. It filters the typed query and never substitutes Ghaziabad for arbitrary text.

Ghaziabad remains the first-run default. Users may also enter city/state/country and valid latitude/longitude manually; changing coordinates recalculates the timezone. Merely typing search text does not activate or overwrite a profile.

## Google Places configuration

1. Enable **Places API (New)** in the intended Google Cloud project.
2. Create separate keys for local web, deployed web and Android delivery. Never reuse an unrestricted key.
3. Restrict API access to Places API (New).
4. Restrict a web key to exact development and production HTTP referrers.
5. Android keys normally require package `com.moinmalik.routine` plus debug/release SHA certificate restrictions. Because a Vite webview REST request cannot reliably satisfy an Android application restriction, production Android should use a native/proxied boundary capable of enforcing that restriction; never place an unrestricted key in the APK.
6. Put the restricted development/web key in local `.env` as `VITE_GOOGLE_PLACES_API_KEY`. `.env` is ignored by Git.

Requested place fields are limited to ID, display name, formatted address, address components and coordinates. Search is biased toward India but not country-restricted. Businesses are excluded by locality/administrative-area primary types.

## Selection and confirmation

- Typing displays loading, result, no-result or provider-error state.
- Arrow keys move through results; Enter selects; Escape closes. Mouse and touch selection are supported.
- Selection resolves Place Details and fills Place ID, formatted address, city, state, country, coordinates and locally derived timezone.
- Editing search/profile text clears selected identity. Only a selected suggestion, confirmed foreground detection, or validated manual coordinates can activate a profile.
- Detect My Location requests one foreground position only. No watcher or background permission is used.
- Save is disabled during local prayer regeneration. A failed operation keeps the previous profile active and can be retried.

## Prayer regeneration and snapshot policy

The settings fingerprint contains coordinates rounded to five decimals, location version, timezone, calculation method, madhab, every manual adjustment and the Sehri offset. A confirmed change increments the location version, generates the current and next month, caches missing dates on demand and reloads the current Home record.

- Past stored routine and completion snapshots remain unchanged.
- Today/future routines with no completed occurrences are rebuilt from active schedules and the new prayer fingerprint.
- Today/future routines with completion history preserve completed occurrence IDs, times and completion rows. Uncompleted prayer-controlled occurrences update in place.
- Cache rows and routine history are never bulk-reset.

Sehri is derived locally from Fajr using the Profile setting “Sehri before Fajr”. It appears only on Friday or configured fasting-range dates. Fajr, Zohar, Ashar/Asr, Maghrib and Isha use named calculated prayer keys. Activity Management cannot set fixed times for these activities.

Development builds show coordinates, timezone, method, madhab, fingerprint and cache/fresh source on the location screen. Production builds do not expose these diagnostics.

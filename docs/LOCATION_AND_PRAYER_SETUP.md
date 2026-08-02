# Location and offline prayer setup

## Provider design

`createLocationProvider()` is the only provider-selection factory. A configured `VITE_GOOGLE_PLACES_API_KEY` selects the provider labelled “Google Places”; no key selects “Development city data”. Both use the same debounced autocomplete controller, keyboard navigation, selection and confirmation flow.

The controller wraps browser timers as owner-preserving calls rather than storing unbound native functions. One DOM binding owns input, keyboard, pointer and outside-click listeners; closing the location view cancels pending work, and application teardown removes listeners and invalidates stale responses.

Google Places API (New) supplies city identity and coordinates only. `tz-lookup` derives the IANA timezone locally and `adhan` calculates prayer times locally. Google is never a prayer-time provider.

## Development without Google

Leave `VITE_GOOGLE_PLACES_API_KEY` blank. The screen keeps the warning “Live city search requires a Google Places API key” but autocomplete remains enabled. The mock catalog contains Ghaziabad, Delhi, Noida, Gurugram, Mumbai, Bengaluru, Hyderabad, Kolkata, Lucknow, Chennai, London and Dubai with coordinates and regions. Timezones are derived through `tz-lookup`.

Search begins after two characters. Unknown text displays “No matching development locations” and never becomes Ghaziabad. A selected mock city fills the same fields as a Google result. Validated manual coordinates remain supported.

## Live Google mode

1. Enable **Places API (New)**.
2. Create separate restricted keys for development web, deployed web and Android delivery.
3. Restrict web keys to exact HTTP referrers and Places API (New).
4. Android keys normally require package `com.moinmalik.routine` plus debug/release signing-certificate restrictions. A production webview REST deployment must use a native or secured proxy boundary capable of enforcing those restrictions; never ship an unrestricted key.
5. Put the restricted development key in local `.env`. Never commit `.env`.

Autocomplete uses a session token and requests only prediction identity/text. Place Details is requested only after selection and is limited to ID, display name, formatted address, address components and coordinates. Search is biased toward India but not country-restricted.

Invalid-key, disabled-API, billing, referrer and quota errors are displayed clearly. When a live request fails, matching mock results may appear only with an explicit “Development city data (Google unavailable)” label. A successful empty Google response is not silently replaced by mock data.

## Confirmation and prayer rebuild

- Typing alone never activates a profile. Selection, confirmed foreground detection or validated manual coordinates are required.
- Changing selected text clears its Place identity.
- Saving persists the exact coordinates, recalculates timezone, increments location version and changes the prayer fingerprint.
- Future entries for the previous fingerprint are invalidated, current/next month timings are regenerated, eligible today/future prayer occurrences refresh, and Home reloads immediately.
- Past snapshots and completion history remain unchanged. Completed current/future occurrences preserve identity and timing.
- If regeneration fails, the previous profile is restored.

Development builds briefly report selected coordinates, timezone, old/new fingerprint prefixes, regenerated prayer-record count and Home refresh status. Production builds hide this diagnostic.

## Protected prayer activities

Sehri, Fajr, Zohar, Ashar/Asr, Maghrib and Isha expose only activity enabled and notification controls. Names, schedules, recurrence, time-slot structure, reordering, deletion and prayer mappings remain locked in both UI and repository validation. Sehri is derived from Fajr using the configured offset and appears only on Friday or configured fasting dates.

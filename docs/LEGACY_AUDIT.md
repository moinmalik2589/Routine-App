# Legacy `index.html` audit

## Files inspected before migration

The original project contained exactly one file: `index.html` (1,281 lines, inline HTML/CSS/JavaScript). No Apps Script server files, prayer dataset, package metadata, tests, or Git metadata were present. This audit records the original implementation contract before `index.html` was migrated into the Vite entry point and source modules.

## Interface and behavior inventory

- Header: `MOIN MALIK`, live 12-hour clock, selected weekday, hamburger menu, date picker, previous/next date navigation.
- Daily view: all-alarm title toggle, green/red alarm-time toggles, conic progress ring, sorted Timing/Activity/Status rows, editable completion checkboxes, Fajr and fasting-time footer.
- Monthly view: month picker, month alarm batch toggle, per-date alarm toggle, total/up-to-today ring mode, completion grid for 13 activities, completion summary.
- Activity view: activity selector, weekly/monthly/yearly modes, week/month/year controls, activity alarm batch/per-date toggles, fasting start/end toggles, progress ring, detail grid and summary.
- Routine timing rules: prayer-derived times, Friday fasting/Sehri behavior, Ramadan-specific Gym/Bath behavior, non-alarm textual timings, chronological sorting.
- Progress colors: red below 50%, yellow 50–79%, green 80–99%, blue at 100%.
- Alarm IDs: `WAKEUP`, `WAKEUP_AGAIN`, `FAST_START`, `FAST_END`, `FAJR`, `ZOHAR`, `ASHAR`, `MAGHRIB`, `ISHA`.

## `google.script.run` dependency inventory

| Server function | Client callers | Arguments | Expected result / side effect |
| --- | --- | --- | --- |
| `getRoutineForDate` | `fetchRoutine` | ISO date string | Returns `{ sheetName, rowIndex, headers, data, prayerTimings }` or `{ error }`. Has success and failure handlers. |
| `updateAlarmState` | `toggleDailyAlarm`, `toggleSpecificAlarm` | sheet name, row index, daily enabled boolean, comma-separated disabled alarm IDs | Persists daily/global and individual alarm state. No response handler. |
| `updateCheckbox` | `updateCheckboxInSheet` | sheet name, row index, numeric column index, checked boolean | Persists one activity completion. No response handler. |
| `getMonthData` | `fetchMonthlyData`, `fetchActivityData` | spreadsheet-style `Month YYYY` | Returns `{ headers, data, prayerData }` or `{ error }`. |
| `getYearData` | `fetchActivityYearData` | year string | Returns `{ headers, data, prayerData }`; yearly rows append their sheet name. |
| `batchUpdateAlarms` | monthly/activity batch and date toggles | object keyed by sheet name; values are `{ row, t, u }[]` (`t` daily state, `u` disabled IDs) | Persists alarm changes across dates. No response handler. |

## Legacy positional data contract

- Row indexes: date `0`, weekday `1`, activities `2–15`, daily alarm state `19`, disabled alarm CSV `20`.
- Activity columns: Wake Up `2`, Tahajjud `3`, Sehri `4`, Fajr `6`, Nap `7`, Again Wakeup `8`, Gym `9`, Bath `10`, Zohar `11`, Ashar `12`, Maghrib `13`, Isha `14`, Go to Sleep `15`.
- Prayer array indexes used by the UI: fast start `3`, Fajr end `4`, fast end `5`, Fajr prayer `9`, nap `10`, second wake-up `11`, gym `12`, Zohar `13`, Ashar `14`, Maghrib `15`, Isha `16`.

## Risks and migration notes

- The legacy UI contained mojibake for hamburger/chart/bell emoji; migration restores the intended glyphs without changing layout.
- Ramadan was hard-coded as 7 February–9 March 2027 in two places.
- Year choices were hard-coded to 2026 and 2027.
- Fast-time yearly lookup assumed prayer data began on 1 July 2026 and relied on array offsets.
- Several date parses used browser-local `new Date('YYYY-MM-DD')`, which can shift the day. The migrated app uses explicit Asia/Kolkata date helpers.
- Dynamic HTML used inline handlers and spreadsheet indexes. Phase 1 switches runtime data to named activity/day objects and event delegation; SQLite models arrive in Phase 3.

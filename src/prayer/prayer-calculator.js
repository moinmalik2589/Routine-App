import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from 'adhan';
import { parseIsoDate } from '../date-utils.js';

export const CALCULATION_METHODS = Object.freeze(['Karachi', 'MuslimWorldLeague', 'Egyptian', 'UmmAlQura', 'Dubai', 'MoonsightingCommittee', 'NorthAmerica', 'Kuwait', 'Qatar', 'Singapore', 'Tehran', 'Turkey']);
export const MADHABS = Object.freeze(['Hanafi', 'Shafi']);

function format(date, timeZone) { return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).format(date); }

export function prayerSettingsFingerprint(profile) {
  const adjustments = Object.fromEntries(Object.entries(profile.adjustments || {}).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify({ latitude: Number(profile.latitude.toFixed(5)), longitude: Number(profile.longitude.toFixed(5)), locationVersion: profile.locationVersion, timeZone: profile.timeZone, calculationMethod: profile.calculationMethod, madhab: profile.madhab, adjustments });
}

export function calculatePrayerTimes(date, profile) {
  const { year, month, day } = parseIsoDate(date); const methodFactory = CalculationMethod[profile.calculationMethod] || CalculationMethod.Karachi; const parameters = methodFactory();
  parameters.madhab = profile.madhab === 'Hanafi' ? Madhab.Hanafi : Madhab.Shafi; parameters.adjustments = { ...parameters.adjustments, ...(profile.adjustments || {}) };
  const times = new PrayerTimes(new Coordinates(profile.latitude, profile.longitude), new Date(year, month - 1, day), parameters);
  const formatted = { fajr: format(times.fajr, profile.timeZone), sunrise: format(times.sunrise, profile.timeZone), dhuhr: format(times.dhuhr, profile.timeZone), asr: format(times.asr, profile.timeZone), maghrib: format(times.maghrib, profile.timeZone), isha: format(times.isha, profile.timeZone) };
  return { date, ...formatted, fajrStart: formatted.fajr, fastStart: formatted.fajr, fajrEnd: formatted.sunrise, fastEnd: formatted.maghrib, fajrPrayer: formatted.fajr, zohar: formatted.dhuhr, ashar: formatted.asr, source: 'adhan-local', settingsFingerprint: prayerSettingsFingerprint(profile), generatedAt: new Date().toISOString() };
}

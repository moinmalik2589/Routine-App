import { CalculationMethod, Coordinates, HighLatitudeRule, Madhab, PolarCircleResolution, PrayerTimes, Shafaq } from 'adhan';
import { parseIsoDate } from '../date-utils.js';

export const PRAYER_CACHE_FORMAT_VERSION = 2;
export const PRAYER_CALCULATOR_VERSION = 'adhan-4.4.4/cache-2';
export const CALCULATION_METHODS = Object.freeze(['Karachi', 'MuslimWorldLeague', 'Egyptian', 'UmmAlQura', 'Dubai', 'MoonsightingCommittee', 'NorthAmerica', 'Kuwait', 'Qatar', 'Singapore', 'Tehran', 'Turkey']);
export const CALCULATION_METHOD_OPTIONS = Object.freeze([
  ['MuslimWorldLeague', 'Muslim World League'], ['Egyptian', 'Egyptian'], ['Karachi', 'Karachi'], ['UmmAlQura', 'Umm al-Qura'], ['Dubai', 'Dubai'], ['Qatar', 'Qatar'], ['Kuwait', 'Kuwait'], ['MoonsightingCommittee', 'Moonsighting Committee'], ['Singapore', 'Singapore'], ['Turkey', 'Turkey'], ['Tehran', 'Tehran'], ['NorthAmerica', 'North America / ISNA'],
].map(([value, label]) => Object.freeze({ value, label })));
export const MADHABS = Object.freeze(['Hanafi', 'Shafi']);
export const HIGH_LATITUDE_RULE_OPTIONS = Object.freeze([
  { value: 'recommended', label: 'Recommended automatically' }, { value: 'middleOfTheNight', label: 'Middle of the Night' }, { value: 'seventhOfTheNight', label: 'Seventh of the Night' }, { value: 'twilightAngle', label: 'Twilight Angle' }, { value: 'none', label: 'None / raw method' },
]);
export const POLAR_CIRCLE_OPTIONS = Object.freeze([{ value: 'Unresolved', label: 'Unresolved' }, { value: 'AqrabYaum', label: 'Nearest day' }, { value: 'AqrabBalad', label: 'Nearest latitude' }]);
export const SHAFAQ_OPTIONS = Object.freeze([{ value: 'general', label: 'General' }, { value: 'ahmer', label: 'Red twilight (Ahmer)' }, { value: 'abyad', label: 'White twilight (Abyad)' }]);

const formatter = (timeZone) => new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true });
export function formatPrayerInstant(date, timeZone) { return formatter(timeZone).format(date); }
export function timezoneOffsetForInstant(date, timeZone) { return new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(date).find(({ type }) => type === 'timeZoneName')?.value || ''; }
export function createAdhanCalendarDate(isoDate) { const { year, month, day } = parseIsoDate(isoDate); const date = new Date(0); date.setFullYear(year, month - 1, day); date.setHours(12, 0, 0, 0); return date; }

export function resolveHighLatitudeRule(selection, coordinates) {
  if (selection === 'recommended' || !selection) return HighLatitudeRule.recommended(coordinates);
  const rules = { middleOfTheNight: HighLatitudeRule.MiddleOfTheNight, seventhOfTheNight: HighLatitudeRule.SeventhOfTheNight, twilightAngle: HighLatitudeRule.TwilightAngle };
  if (selection === 'none') return 'none'; if (!rules[selection]) throw new Error(`Unknown high-latitude rule: ${selection}`); return rules[selection];
}

export function calculationParametersForProfile(profile) {
  const methodFactory = CalculationMethod[profile.calculationMethod]; if (typeof methodFactory !== 'function' || profile.calculationMethod === 'Other') throw new Error(`Unknown prayer calculation method: ${profile.calculationMethod}`);
  const coordinates = new Coordinates(Number(profile.latitude), Number(profile.longitude)); const parameters = methodFactory();
  parameters.madhab = profile.madhab === 'Hanafi' ? Madhab.Hanafi : profile.madhab === 'Shafi' ? Madhab.Shafi : (() => { throw new Error(`Unknown madhab: ${profile.madhab}`); })();
  if (profile.fajrAngleOverride != null && profile.fajrAngleOverride !== '') parameters.fajrAngle = Number(profile.fajrAngleOverride);
  if (profile.ishaAngleOverride != null && profile.ishaAngleOverride !== '') { parameters.ishaAngle = Number(profile.ishaAngleOverride); parameters.ishaInterval = 0; }
  if (profile.ishaIntervalOverride != null && profile.ishaIntervalOverride !== '') parameters.ishaInterval = Number(profile.ishaIntervalOverride);
  const resolvedRule = resolveHighLatitudeRule(profile.highLatitudeRule, coordinates); parameters.highLatitudeRule = resolvedRule === 'none' ? HighLatitudeRule.MiddleOfTheNight : resolvedRule;
  if (resolvedRule === 'none') parameters.nightPortions = () => ({ fajr: 1, isha: 1 });
  const polar = PolarCircleResolution[profile.polarCircleResolution || 'Unresolved']; if (!polar) throw new Error(`Unknown polar-circle resolution: ${profile.polarCircleResolution}`); parameters.polarCircleResolution = polar;
  const shafaq = Object.values(Shafaq).includes(profile.shafaq) ? profile.shafaq : null; if (!shafaq) throw new Error(`Unknown shafaq setting: ${profile.shafaq}`); parameters.shafaq = shafaq;
  parameters.adjustments = { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0, ...(profile.adjustments || {}) };
  return { coordinates, parameters, resolvedHighLatitudeRule: resolvedRule };
}

export function prayerSettingsFingerprint(profile) {
  const adjustments = Object.fromEntries(Object.entries(profile.adjustments || {}).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify({ cacheFormatVersion: PRAYER_CACHE_FORMAT_VERSION, calculatorVersion: PRAYER_CALCULATOR_VERSION, latitude: Number(Number(profile.latitude).toFixed(5)), longitude: Number(Number(profile.longitude).toFixed(5)), locationVersion: String(profile.locationVersion), timeZone: profile.timeZone, calculationMethod: profile.calculationMethod, fajrAngleOverride: profile.fajrAngleOverride ?? null, ishaAngleOverride: profile.ishaAngleOverride ?? null, ishaIntervalOverride: profile.ishaIntervalOverride ?? null, madhab: profile.madhab, highLatitudeRule: profile.highLatitudeRule || 'recommended', polarCircleResolution: profile.polarCircleResolution || 'Unresolved', shafaq: profile.shafaq || 'general', adjustments, sehriOffsetMinutes: Number(profile.sehriOffsetMinutes ?? 30) });
}

export function calculatePrayerTimes(date, profile) {
  const targetDate = createAdhanCalendarDate(date); const { coordinates, parameters, resolvedHighLatitudeRule } = calculationParametersForProfile(profile); const times = new PrayerTimes(coordinates, targetDate, parameters);
  const rawInstants = Object.fromEntries(['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].map((key) => [key, times[key].toISOString()]));
  const formatted = Object.fromEntries(Object.entries(rawInstants).map(([key, iso]) => [key, formatPrayerInstant(new Date(iso), profile.timeZone)]));
  const sehriInstant = new Date(times.fajr.getTime() - Number(profile.sehriOffsetMinutes ?? 30) * 60000); const sehriStart = formatPrayerInstant(sehriInstant, profile.timeZone); const timezoneOffset = timezoneOffsetForInstant(times.fajr, profile.timeZone);
  const record = { date, ...formatted, rawInstants, timeZone: profile.timeZone, timezoneOffset, cacheFormatVersion: PRAYER_CACHE_FORMAT_VERSION, calculatorVersion: PRAYER_CALCULATOR_VERSION, calculationMethod: profile.calculationMethod, fajrAngle: parameters.fajrAngle, ishaAngle: parameters.ishaAngle, ishaInterval: parameters.ishaInterval, highLatitudeRule: profile.highLatitudeRule || 'recommended', resolvedHighLatitudeRule, polarCircleResolution: profile.polarCircleResolution || 'Unresolved', shafaq: profile.shafaq || 'general', manualAdjustments: structuredClone(parameters.adjustments), fajrStart: formatted.fajr, fastStart: formatted.fajr, sehriStart, sehri: `${sehriStart} - ${formatted.fajr}`, fajrEnd: formatted.sunrise, fastEnd: formatted.maghrib, fajrPrayer: formatted.fajr, zohar: formatted.dhuhr, ashar: formatted.asr, source: 'adhan-local', settingsFingerprint: prayerSettingsFingerprint(profile), generatedAt: new Date().toISOString() };
  if (import.meta.env?.DEV && profile.city?.toLowerCase() === 'london') console.debug('[development] London prayer calculation', { inputDate: date, latitude: profile.latitude, longitude: profile.longitude, timeZone: profile.timeZone, method: profile.calculationMethod, fajrAngle: parameters.fajrAngle, highLatitudeRule: resolvedHighLatitudeRule, manualFajrAdjustment: parameters.adjustments.fajr, rawFajrUtc: rawInstants.fajr, formattedFajr: formatted.fajr, cachedFajr: record.fajr, homeFajr: record.fajrStart });
  return record;
}

export function inspectPrayerCalculation(date, profile) { const record = calculatePrayerTimes(date, profile); return { inputs: { date, latitude: profile.latitude, longitude: profile.longitude, timeZone: profile.timeZone, calculationMethod: profile.calculationMethod, madhab: profile.madhab, highLatitudeRule: profile.highLatitudeRule, adjustments: profile.adjustments }, method: { fajrAngle: record.fajrAngle, ishaAngle: record.ishaAngle, ishaInterval: record.ishaInterval, resolvedHighLatitudeRule: record.resolvedHighLatitudeRule, polarCircleResolution: record.polarCircleResolution, shafaq: record.shafaq }, rawUtc: record.rawInstants, local: { fajr: record.fajr, sunrise: record.sunrise, dhuhr: record.dhuhr, asr: record.asr, maghrib: record.maghrib, isha: record.isha }, timezoneOffset: record.timezoneOffset, fingerprint: record.settingsFingerprint, source: record.source, cacheFormatVersion: record.cacheFormatVersion }; }

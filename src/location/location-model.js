import tzlookup from 'tz-lookup';
import { automaticPrayerSettings, resetPrayerAdjustments } from '../prayer/automatic-settings.js';

export const DEFAULT_LOCATION_SUGGESTION = Object.freeze({
  placeId: 'development-ghaziabad', displayName: 'Ghaziabad', formattedAddress: 'Ghaziabad, Uttar Pradesh, India',
  city: 'Ghaziabad', state: 'Uttar Pradesh', country: 'India', latitude: 28.6692, longitude: 77.4538,
  timeZone: 'Asia/Kolkata', calculationMethod: 'Karachi', madhab: 'Hanafi', sehriOffsetMinutes: 30,
  highLatitudeRule: 'recommended', polarCircleResolution: 'Unresolved', shafaq: 'general', fajrAngleOverride: null, ishaAngleOverride: null, ishaIntervalOverride: null,
  adjustments: resetPrayerAdjustments(), locationSource: 'default-suggestion',
});

export function validateCoordinates(latitudeInput, longitudeInput) {
  const latitude = Number(latitudeInput), longitude = Number(longitudeInput);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error('Latitude must be a number between -90 and 90.');
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error('Longitude must be a number between -180 and 180.');
  return { latitude, longitude };
}

export function canActivateLocationDraft({ selectedPlace, coordinatesChanged } = {}) { return Boolean(selectedPlace || coordinatesChanged); }

export function createLocationProfile(input) {
  const { latitude, longitude } = validateCoordinates(input.latitude, input.longitude);
  if (!input.city?.trim() || !input.country?.trim()) throw new Error('A city and country are required.');
  const timeZone = input.timeZone || tzlookup(latitude, longitude);
  try { new Intl.DateTimeFormat('en-US', { timeZone }).format(); } catch { throw new Error('A valid IANA timezone is required.'); }
  const timestamp = new Date().toISOString(); const automatic = automaticPrayerSettings(input); const displayName = input.displayName?.trim() || input.city.trim();
  return {
    id: 'default', placeId: input.placeId || null, displayName,
    formattedAddress: input.formattedAddress?.trim() || [input.city, input.state, input.country].filter(Boolean).join(', '),
    city: input.city.trim(), state: input.state?.trim() || '', country: input.country.trim(), latitude, longitude, timeZone, timezone: timeZone,
    calculationMethod: input.calculationMethod || automatic.calculationMethod, madhab: input.madhab || automatic.madhab, highLatitudeRule: input.highLatitudeRule || automatic.highLatitudeRule, polarCircleResolution: input.polarCircleResolution || automatic.polarCircleResolution, shafaq: input.shafaq || automatic.shafaq,
    fajrAngleOverride: input.fajrAngleOverride === '' || input.fajrAngleOverride == null ? null : Number(input.fajrAngleOverride), ishaAngleOverride: input.ishaAngleOverride === '' || input.ishaAngleOverride == null ? null : Number(input.ishaAngleOverride), ishaIntervalOverride: input.ishaIntervalOverride === '' || input.ishaIntervalOverride == null ? null : Number(input.ishaIntervalOverride),
    adjustments: { ...DEFAULT_LOCATION_SUGGESTION.adjustments, ...(input.adjustments || {}) },
    sehriOffsetMinutes: Math.max(0, Number(input.sehriOffsetMinutes ?? 30) || 0), locationSource: input.locationSource || 'manual',
    locationVersion: String(input.locationVersion || Date.now()), createdAt: input.createdAt || timestamp, updatedAt: timestamp,
  };
}

export function validateDisplayName(value) { const name = String(value || '').trim(); if (!name) throw new Error('Your name is required.'); return name; }

export function normalizeStoredProfile(profile, { developmentSeedName = 'MOIN MALIK' } = {}) {
  if (!profile) return profile;
  const legacyCityLabel = !profile.displayName || profile.displayName.trim().toLowerCase() === profile.city?.trim().toLowerCase();
  return { ...profile, displayName: legacyCityLabel ? developmentSeedName : profile.displayName, createdAt: profile.createdAt || profile.updatedAt || new Date().toISOString() };
}

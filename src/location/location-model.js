export const DEFAULT_LOCATION_SUGGESTION = Object.freeze({ city: 'Ghaziabad', state: 'Uttar Pradesh', country: 'India', latitude: 28.6692, longitude: 77.4538, timeZone: 'Asia/Kolkata', calculationMethod: 'Karachi', madhab: 'Hanafi', adjustments: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 }, locationSource: 'default-suggestion' });

export function createLocationProfile(input) {
  const latitude = Number(input.latitude), longitude = Number(input.longitude);
  if (!input.city?.trim() || !input.country?.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('A city, country, latitude, and longitude are required.');
  try { new Intl.DateTimeFormat('en-US', { timeZone: input.timeZone }).format(); } catch { throw new Error('A valid IANA timezone is required.'); }
  return { id: 'default', city: input.city.trim(), state: input.state?.trim() || '', country: input.country.trim(), latitude, longitude, timeZone: input.timeZone, calculationMethod: input.calculationMethod || 'Karachi', madhab: input.madhab || 'Hanafi', adjustments: { ...DEFAULT_LOCATION_SUGGESTION.adjustments, ...(input.adjustments || {}) }, locationSource: input.locationSource || 'manual', locationVersion: input.locationVersion || `${Date.now()}`, updatedAt: new Date().toISOString() };
}

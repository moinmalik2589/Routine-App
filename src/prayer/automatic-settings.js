const COUNTRY_METHODS = new Map([
  ['india', 'Karachi'], ['pakistan', 'Karachi'], ['bangladesh', 'Karachi'],
  ['united kingdom', 'MoonsightingCommittee'], ['uk', 'MoonsightingCommittee'],
  ['united arab emirates', 'Dubai'], ['uae', 'Dubai'], ['qatar', 'Qatar'], ['kuwait', 'Kuwait'],
  ['saudi arabia', 'UmmAlQura'], ['singapore', 'Singapore'], ['turkey', 'Turkey'],
  ['iran', 'Tehran'], ['egypt', 'Egyptian'], ['united states', 'NorthAmerica'],
  ['united states of america', 'NorthAmerica'], ['canada', 'NorthAmerica'],
]);

export function automaticCalculationMethod(country = '') { return COUNTRY_METHODS.get(String(country).trim().toLowerCase()) || 'MuslimWorldLeague'; }
export function automaticPrayerSettings(location = {}) { return { calculationMethod: automaticCalculationMethod(location.country), madhab: 'Hanafi', highLatitudeRule: 'recommended', polarCircleResolution: 'Unresolved', shafaq: 'general', fajrAngleOverride: null, ishaAngleOverride: null, ishaIntervalOverride: null }; }
export function resetPrayerAdjustments() { return { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 }; }

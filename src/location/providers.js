import tzlookup from 'tz-lookup';
import { DEFAULT_LOCATION_SUGGESTION } from './location-model.js';

export function resolveTimezone(latitude, longitude) { return tzlookup(Number(latitude), Number(longitude)); }

export class BrowserGeolocationProvider {
  async detect() {
    if (!navigator.geolocation) throw new Error('Foreground location is unavailable.');
    return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      (error) => reject(new Error(error.message || 'Location permission denied.')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    ));
  }
}

export const DEVELOPMENT_CITIES = Object.freeze([
  DEFAULT_LOCATION_SUGGESTION,
  { placeId: 'mock-delhi', displayName: 'Delhi', formattedAddress: 'Delhi, Delhi, India', city: 'Delhi', state: 'Delhi', country: 'India', latitude: 28.6139, longitude: 77.209, timeZone: 'Asia/Kolkata' },
  { placeId: 'mock-noida', displayName: 'Noida', formattedAddress: 'Noida, Uttar Pradesh, India', city: 'Noida', state: 'Uttar Pradesh', country: 'India', latitude: 28.5355, longitude: 77.391 },
  { placeId: 'mock-gurugram', displayName: 'Gurugram', formattedAddress: 'Gurugram, Haryana, India', city: 'Gurugram', state: 'Haryana', country: 'India', latitude: 28.4595, longitude: 77.0266 },
  { placeId: 'mock-mumbai', displayName: 'Mumbai', formattedAddress: 'Mumbai, Maharashtra, India', city: 'Mumbai', state: 'Maharashtra', country: 'India', latitude: 19.076, longitude: 72.8777, timeZone: 'Asia/Kolkata' },
  { placeId: 'mock-bengaluru', displayName: 'Bengaluru', formattedAddress: 'Bengaluru, Karnataka, India', city: 'Bengaluru', state: 'Karnataka', country: 'India', latitude: 12.9716, longitude: 77.5946, timeZone: 'Asia/Kolkata' },
  { placeId: 'mock-kolkata', displayName: 'Kolkata', formattedAddress: 'Kolkata, West Bengal, India', city: 'Kolkata', state: 'West Bengal', country: 'India', latitude: 22.5726, longitude: 88.3639, timeZone: 'Asia/Kolkata' },
  { placeId: 'mock-hyderabad', displayName: 'Hyderabad', formattedAddress: 'Hyderabad, Telangana, India', city: 'Hyderabad', state: 'Telangana', country: 'India', latitude: 17.385, longitude: 78.4867, timeZone: 'Asia/Kolkata' },
  { placeId: 'mock-lucknow', displayName: 'Lucknow', formattedAddress: 'Lucknow, Uttar Pradesh, India', city: 'Lucknow', state: 'Uttar Pradesh', country: 'India', latitude: 26.8467, longitude: 80.9462, timeZone: 'Asia/Kolkata' },
  { placeId: 'mock-chennai', displayName: 'Chennai', formattedAddress: 'Chennai, Tamil Nadu, India', city: 'Chennai', state: 'Tamil Nadu', country: 'India', latitude: 13.0827, longitude: 80.2707 },
  { placeId: 'mock-london', displayName: 'London', formattedAddress: 'London, England, United Kingdom', city: 'London', state: 'England', country: 'United Kingdom', latitude: 51.5074, longitude: -0.1278 },
  { placeId: 'mock-dubai', displayName: 'Dubai', formattedAddress: 'Dubai, Dubai, United Arab Emirates', city: 'Dubai', state: 'Dubai', country: 'United Arab Emirates', latitude: 25.2048, longitude: 55.2708 },
].map((item) => Object.freeze({ ...item, timeZone: resolveTimezone(item.latitude, item.longitude), label: item.formattedAddress, locationSource: 'development-mock', providerLabel: 'Development city data' })));

export class DevelopmentLocationProvider {
  mode = 'mock';
  label = 'Development city data';
  configured = false;
  developmentMessage = 'Live city search requires a Google Places API key.';
  async search(query) {
    const term = query?.trim().toLocaleLowerCase();
    if (!term || term.length < 2) return [];
    return DEVELOPMENT_CITIES.filter((item) => `${item.city} ${item.state} ${item.country}`.toLocaleLowerCase().includes(term)).map((item) => ({ ...item }));
  }
  async details(placeId) { const place = DEVELOPMENT_CITIES.find((item) => item.placeId === placeId); if (!place) throw new Error('Mock city was not found.'); return { ...place }; }
  async reverseGeocode({ latitude, longitude }) { return { city: '', state: '', country: '', latitude, longitude, timeZone: resolveTimezone(latitude, longitude), locationSource: 'manual-coordinates' }; }
}

function sessionId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

export class GooglePlacesProvider {
  mode = 'google';
  label = 'Google Places';
  constructor({ apiKey, fetchImpl = globalThis.fetch, fallbackProvider = new DevelopmentLocationProvider() } = {}) { this.apiKey = apiKey?.trim(); this.fetch = fetchImpl; this.fallbackProvider = fallbackProvider; this.sessionToken = null; }
  get configured() { return Boolean(this.apiKey); }
  beginSession() { this.sessionToken = sessionId(); return this.sessionToken; }
  endSession() { this.sessionToken = null; }
  async search(query) {
    const input = query?.trim(); if (!this.configured) throw new Error('Live city search requires a Google Places API key.'); if (input.length < 2) return [];
    const token = this.sessionToken || this.beginSession();
    let response; try { response = await this.fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat' },
      body: JSON.stringify({ input, sessionToken: token, includedPrimaryTypes: ['locality', 'administrative_area_level_3'], languageCode: 'en', locationBias: { circle: { center: { latitude: 22.5, longitude: 79 }, radius: 2500000 } } }),
    }); } catch (cause) { const error = new Error(`Google Places network request failed: ${cause.message}`); error.fallbackResults = await this.fallbackProvider.search(input); error.fallbackLabel = 'Development city data (Google unavailable)'; throw error; }
    if (!response.ok) throw await this.apiError(response, input);
    const data = await response.json();
    return (data.suggestions || []).filter(({ placePrediction }) => placePrediction).map(({ placePrediction }) => ({ placeId: placePrediction.placeId, label: placePrediction.text?.text || '', displayName: placePrediction.structuredFormat?.mainText?.text || placePrediction.text?.text || '', secondaryText: placePrediction.structuredFormat?.secondaryText?.text || '', provider: 'google-places' }));
  }
  async details(placeId) {
    if (!this.configured || !placeId) throw new Error('A valid Google Place selection is required.');
    const token = this.sessionToken; const suffix = token ? `?sessionToken=${encodeURIComponent(token)}` : '';
    const response = await this.fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}${suffix}`, { headers: { 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,addressComponents' } });
    if (!response.ok) throw await this.apiError(response); const place = await response.json(); this.endSession();
    const component = (types) => place.addressComponents?.find((item) => types.some((type) => item.types?.includes(type)))?.longText || '';
    const latitude = place.location?.latitude, longitude = place.location?.longitude; if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('The selected place did not provide coordinates.');
    return { placeId: place.id || placeId, displayName: place.displayName?.text || '', formattedAddress: place.formattedAddress || '', city: component(['locality', 'postal_town', 'administrative_area_level_3']) || place.displayName?.text || '', state: component(['administrative_area_level_1']), country: component(['country']), latitude, longitude, timeZone: resolveTimezone(latitude, longitude), locationSource: 'google-places' };
  }
  async reverseGeocode({ latitude, longitude }) {
    const response = await this.fetch('https://places.googleapis.com/v1/places:searchNearby', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': 'places.id' }, body: JSON.stringify({ includedTypes: ['locality'], maxResultCount: 1, locationRestriction: { circle: { center: { latitude, longitude }, radius: 50000 } } }) });
    if (!response.ok) throw new Error('Google Places reverse location lookup failed.'); const data = await response.json(); if (!data.places?.[0]?.id) throw new Error('No nearby city found.'); return this.details(data.places[0].id);
  }
  async apiError(response, query = '') {
    let payload = {}; try { payload = await response.json(); } catch { /* response has no JSON body */ }
    const raw = `${payload.error?.status || ''} ${payload.error?.message || ''}`.trim(); const lower = raw.toLowerCase(); let reason = 'Google Places request failed.';
    if (response.status === 429 || lower.includes('quota')) reason = 'Google Places quota exceeded.';
    else if (lower.includes('api key not valid') || lower.includes('invalid key')) reason = 'Google Places API key is invalid.';
    else if (lower.includes('billing')) reason = 'Google Places billing is unavailable.';
    else if (lower.includes('referer') || lower.includes('referrer')) reason = 'Google Places request was blocked by key referrer restrictions.';
    else if (lower.includes('not been used') || lower.includes('disabled') || lower.includes('not enabled')) reason = 'Places API (New) is not enabled for this key.';
    else if (response.status === 403) reason = 'Google Places access was denied. Check the API key, billing, API enablement, and referrer restrictions.';
    const error = new Error(`${reason}${raw ? ` ${raw}` : ''}`); error.code = payload.error?.status || `HTTP_${response.status}`; error.fallbackResults = query ? await this.fallbackProvider.search(query) : []; error.fallbackLabel = 'Development city data (Google unavailable)'; return error;
  }
}

export function hasGooglePlacesKey(apiKey) { return Boolean(apiKey && apiKey.trim().length >= 10); }
export function createLocationProvider({ apiKey = import.meta.env?.VITE_GOOGLE_PLACES_API_KEY, fetchImpl = globalThis.fetch } = {}) { return hasGooglePlacesKey(apiKey) ? new GooglePlacesProvider({ apiKey, fetchImpl }) : new DevelopmentLocationProvider(); }

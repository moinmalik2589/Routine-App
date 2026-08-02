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
  { placeId: 'mock-mumbai', displayName: 'Mumbai', formattedAddress: 'Mumbai, Maharashtra, India', city: 'Mumbai', state: 'Maharashtra', country: 'India', latitude: 19.076, longitude: 72.8777, timeZone: 'Asia/Kolkata' },
  { placeId: 'mock-bengaluru', displayName: 'Bengaluru', formattedAddress: 'Bengaluru, Karnataka, India', city: 'Bengaluru', state: 'Karnataka', country: 'India', latitude: 12.9716, longitude: 77.5946, timeZone: 'Asia/Kolkata' },
  { placeId: 'mock-kolkata', displayName: 'Kolkata', formattedAddress: 'Kolkata, West Bengal, India', city: 'Kolkata', state: 'West Bengal', country: 'India', latitude: 22.5726, longitude: 88.3639, timeZone: 'Asia/Kolkata' },
  { placeId: 'mock-hyderabad', displayName: 'Hyderabad', formattedAddress: 'Hyderabad, Telangana, India', city: 'Hyderabad', state: 'Telangana', country: 'India', latitude: 17.385, longitude: 78.4867, timeZone: 'Asia/Kolkata' },
  { placeId: 'mock-lucknow', displayName: 'Lucknow', formattedAddress: 'Lucknow, Uttar Pradesh, India', city: 'Lucknow', state: 'Uttar Pradesh', country: 'India', latitude: 26.8467, longitude: 80.9462, timeZone: 'Asia/Kolkata' },
].map((item) => Object.freeze({ ...item, label: item.formattedAddress, locationSource: 'development-mock' })));

export class DevelopmentLocationProvider {
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
  constructor({ apiKey, fetchImpl = globalThis.fetch } = {}) { this.apiKey = apiKey?.trim(); this.fetch = fetchImpl; this.sessionToken = null; }
  get configured() { return Boolean(this.apiKey); }
  beginSession() { this.sessionToken = sessionId(); return this.sessionToken; }
  endSession() { this.sessionToken = null; }
  async search(query) {
    const input = query?.trim(); if (!this.configured) throw new Error('Live city search requires a Google Places API key.'); if (input.length < 2) return [];
    const token = this.sessionToken || this.beginSession();
    const response = await this.fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat' },
      body: JSON.stringify({ input, sessionToken: token, includedPrimaryTypes: ['locality', 'administrative_area_level_3'], languageCode: 'en', locationBias: { circle: { center: { latitude: 22.5, longitude: 79 }, radius: 2500000 } } }),
    });
    if (!response.ok) throw new Error(`Google Places search failed (${response.status}).`);
    const data = await response.json();
    return (data.suggestions || []).filter(({ placePrediction }) => placePrediction).map(({ placePrediction }) => ({ placeId: placePrediction.placeId, label: placePrediction.text?.text || '', displayName: placePrediction.structuredFormat?.mainText?.text || placePrediction.text?.text || '', secondaryText: placePrediction.structuredFormat?.secondaryText?.text || '', provider: 'google-places' }));
  }
  async details(placeId) {
    if (!this.configured || !placeId) throw new Error('A valid Google Place selection is required.');
    const token = this.sessionToken; const suffix = token ? `?sessionToken=${encodeURIComponent(token)}` : '';
    const response = await this.fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}${suffix}`, { headers: { 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,addressComponents' } });
    if (!response.ok) throw new Error(`Google Place details failed (${response.status}).`); const place = await response.json(); this.endSession();
    const component = (types) => place.addressComponents?.find((item) => types.some((type) => item.types?.includes(type)))?.longText || '';
    const latitude = place.location?.latitude, longitude = place.location?.longitude; if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('The selected place did not provide coordinates.');
    return { placeId: place.id || placeId, displayName: place.displayName?.text || '', formattedAddress: place.formattedAddress || '', city: component(['locality', 'postal_town', 'administrative_area_level_3']) || place.displayName?.text || '', state: component(['administrative_area_level_1']), country: component(['country']), latitude, longitude, timeZone: resolveTimezone(latitude, longitude), locationSource: 'google-places' };
  }
  async reverseGeocode({ latitude, longitude }) {
    const response = await this.fetch('https://places.googleapis.com/v1/places:searchNearby', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': 'places.id' }, body: JSON.stringify({ includedTypes: ['locality'], maxResultCount: 1, locationRestriction: { circle: { center: { latitude, longitude }, radius: 50000 } } }) });
    if (!response.ok) throw new Error('Google Places reverse location lookup failed.'); const data = await response.json(); if (!data.places?.[0]?.id) throw new Error('No nearby city found.'); return this.details(data.places[0].id);
  }
}

export function hasGooglePlacesKey(apiKey) { return Boolean(apiKey && apiKey.trim().length >= 10); }
export function createLocationSearchProvider(apiKey = import.meta.env?.VITE_GOOGLE_PLACES_API_KEY) { return hasGooglePlacesKey(apiKey) ? new GooglePlacesProvider({ apiKey }) : new DevelopmentLocationProvider(); }

import { DEFAULT_LOCATION_SUGGESTION } from './location-model.js';
import tzlookup from 'tz-lookup';

export function resolveTimezone(latitude, longitude) { return tzlookup(Number(latitude), Number(longitude)); }

export class BrowserGeolocationProvider {
  async detect() {
    if (!navigator.geolocation) throw new Error('Foreground location is unavailable.');
    return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }), (error) => reject(new Error(error.message || 'Location permission denied.')), { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }));
  }
}

export class DevelopmentLocationProvider {
  async search(query) { return query?.trim() ? [{ ...DEFAULT_LOCATION_SUGGESTION, locationSource: 'development-fallback' }] : []; }
  async reverseGeocode() { return { ...DEFAULT_LOCATION_SUGGESTION, locationSource: 'development-fallback' }; }
}

export class GooglePlacesProvider {
  constructor({ apiKey, fetchImpl = globalThis.fetch } = {}) { this.apiKey = apiKey; this.fetch = fetchImpl; }
  get configured() { return Boolean(this.apiKey); }
  async search(query) {
    if (!this.configured || query.trim().length < 3) return [];
    const response = await this.fetch('https://places.googleapis.com/v1/places:autocomplete', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text' }, body: JSON.stringify({ input: query, includedPrimaryTypes: ['locality'], languageCode: 'en' }) });
    if (!response.ok) throw new Error('Google Places search failed.');
    const data = await response.json(); return (data.suggestions || []).map(({ placePrediction }) => ({ placeId: placePrediction.placeId, label: placePrediction.text?.text }));
  }
  async details(placeId) {
    const response = await this.fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, { headers: { 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': 'displayName,location,addressComponents' } });
    if (!response.ok) throw new Error('Google Place details failed.'); const place = await response.json();
    const component = (type) => place.addressComponents?.find(({ types }) => types.includes(type))?.longText || '';
    return { city: component('locality') || place.displayName?.text || '', state: component('administrative_area_level_1'), country: component('country'), latitude: place.location.latitude, longitude: place.location.longitude, timeZone: resolveTimezone(place.location.latitude, place.location.longitude), locationSource: 'google-places' };
  }
  async reverseGeocode({ latitude, longitude }) {
    const response = await this.fetch('https://places.googleapis.com/v1/places:searchNearby', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': 'places.id' }, body: JSON.stringify({ includedTypes: ['locality'], maxResultCount: 1, locationRestriction: { circle: { center: { latitude, longitude }, radius: 50000 } } }) });
    if (!response.ok) throw new Error('Google Places reverse location lookup failed.'); const data = await response.json(); if (!data.places?.[0]?.id) throw new Error('No nearby city found.'); return this.details(data.places[0].id);
  }
}

export function createLocationSearchProvider(apiKey = import.meta.env?.VITE_GOOGLE_PLACES_API_KEY) { return apiKey ? new GooglePlacesProvider({ apiKey }) : new DevelopmentLocationProvider(); }

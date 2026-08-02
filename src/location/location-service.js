import { DEFAULT_LOCATION_SUGGESTION } from './location-model.js';

export class LocationSetupService {
  constructor({ geolocation, reverseGeocoder, searchProvider }) { this.geolocation = geolocation; this.reverseGeocoder = reverseGeocoder; this.searchProvider = searchProvider; }
  getDefaultSuggestion() { return structuredClone(DEFAULT_LOCATION_SUGGESTION); }
  async detect() { const coordinates = await this.geolocation.detect(); const address = await this.reverseGeocoder.reverseGeocode(coordinates); return { ...address, ...coordinates, locationSource: 'device-foreground' }; }
  async detectOrFallback() { try { return { detected: true, location: await this.detect() }; } catch (error) { return { detected: false, error: error.message, location: this.getDefaultSuggestion() }; } }
  search(query) { return this.searchProvider.search(query); }
}

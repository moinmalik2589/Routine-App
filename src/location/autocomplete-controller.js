export class LocationAutocompleteController {
  constructor({ provider, debounceMs = 300, minimumLength = 2, onState = () => {}, schedule = setTimeout, cancel = clearTimeout }) {
    this.provider = provider; this.debounceMs = debounceMs; this.minimumLength = minimumLength; this.onState = onState; this.schedule = schedule; this.cancel = cancel;
    this.timer = null; this.requestId = 0; this.state = { query: '', status: 'idle', results: [], activeIndex: -1, error: null };
  }
  emit(changes) { this.state = { ...this.state, ...changes }; this.onState(this.state); return this.state; }
  input(query) {
    if (this.timer) this.cancel(this.timer); const requestId = ++this.requestId; const value = query.trim();
    if (value.length < this.minimumLength) return this.emit({ query, status: 'idle', results: [], activeIndex: -1, error: null });
    this.emit({ query, status: 'loading', results: [], activeIndex: -1, error: null });
    this.timer = this.schedule(() => { void this.run(value, requestId); }, this.debounceMs); return this.state;
  }
  async run(query, requestId = ++this.requestId) {
    try { const results = await this.provider.search(query); if (requestId !== this.requestId) return null; return this.emit({ query, results, status: results.length ? 'results' : 'empty', activeIndex: results.length ? 0 : -1, error: null }); }
    catch (error) { if (requestId !== this.requestId) return null; const results = error.fallbackResults || []; return this.emit({ query, results, status: results.length ? 'fallback' : 'error', activeIndex: results.length ? 0 : -1, error, fallbackLabel: error.fallbackLabel || null }); }
  }
  move(amount) { if (!this.state.results.length) return this.state; const length = this.state.results.length; return this.emit({ activeIndex: (this.state.activeIndex + amount + length) % length }); }
  escape() { this.requestId++; if (this.timer) this.cancel(this.timer); return this.emit({ status: 'idle', results: [], activeIndex: -1, error: null }); }
  current() { return this.state.results[this.state.activeIndex] || null; }
}

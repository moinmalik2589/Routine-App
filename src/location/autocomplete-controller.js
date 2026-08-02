export function createBrowserClock(scope = globalThis) {
  return {
    setTimeout: (callback, delay) => scope.setTimeout(callback, delay),
    clearTimeout: (id) => scope.clearTimeout(id),
  };
}

export class LocationAutocompleteController {
  constructor({ provider, debounceMs = 300, minimumLength = 2, onState = () => {}, clock = createBrowserClock() }) {
    this.provider = provider; this.debounceMs = debounceMs; this.minimumLength = minimumLength; this.onState = onState; this.clock = clock;
    this.timer = null; this.requestId = 0; this.destroyed = false; this.state = { query: '', status: 'idle', results: [], activeIndex: -1, error: null };
    this.input = this.input.bind(this); this.run = this.run.bind(this); this.move = this.move.bind(this); this.escape = this.escape.bind(this); this.destroy = this.destroy.bind(this);
  }
  emit(changes) { if (this.destroyed) return this.state; this.state = { ...this.state, ...changes }; this.onState(this.state); return this.state; }
  cancelPending() { if (this.timer !== null) { this.clock.clearTimeout(this.timer); this.timer = null; } }
  input(query) {
    if (this.destroyed) return this.state; this.cancelPending(); const requestId = ++this.requestId; const value = String(query ?? '').trim();
    if (value.length < this.minimumLength) return this.emit({ query: value, status: 'idle', results: [], activeIndex: -1, error: null, fallbackLabel: null });
    this.emit({ query: value, status: 'loading', results: [], activeIndex: -1, error: null, fallbackLabel: null });
    this.timer = this.clock.setTimeout(() => { this.timer = null; void this.run(value, requestId); }, this.debounceMs); return this.state;
  }
  async run(query, requestId = ++this.requestId) {
    try { const results = await this.provider.search(query); if (this.destroyed || requestId !== this.requestId) return null; return this.emit({ query, results, status: results.length ? 'results' : 'empty', activeIndex: results.length ? 0 : -1, error: null, fallbackLabel: null }); }
    catch (error) { if (this.destroyed || requestId !== this.requestId) return null; const results = error.fallbackResults || []; return this.emit({ query, results, status: results.length ? 'fallback' : 'error', activeIndex: results.length ? 0 : -1, error, fallbackLabel: error.fallbackLabel || null }); }
  }
  move(amount) { if (this.destroyed || !this.state.results.length) return this.state; const length = this.state.results.length; return this.emit({ activeIndex: (this.state.activeIndex + amount + length) % length }); }
  escape() { if (this.destroyed) return this.state; this.cancelPending(); this.requestId++; return this.emit({ status: 'idle', results: [], activeIndex: -1, error: null, fallbackLabel: null }); }
  current() { return this.destroyed ? null : this.state.results[this.state.activeIndex] || null; }
  destroy() { if (this.destroyed) return; this.cancelPending(); this.requestId++; this.destroyed = true; this.state = { ...this.state, status: 'idle', results: [], activeIndex: -1, error: null }; this.onState = () => {}; }
}

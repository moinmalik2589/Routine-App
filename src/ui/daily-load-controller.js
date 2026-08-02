export class DailyLoadController {
  constructor({ repository, onLoading, onSuccess, onError, logger = console }) { this.repository = repository; this.onLoading = onLoading; this.onSuccess = onSuccess; this.onError = onError; this.logger = logger; this.requestId = 0; this.currentDay = null; this.loading = false; }
  async load(date) {
    const requestId = ++this.requestId; this.currentDay = null; this.loading = true; this.onLoading?.(true, date);
    try {
      const day = await this.repository.getDay(date); if (requestId !== this.requestId) return { stale: true, day: null };
      if (!day?.date) throw new Error(`No daily routine record was returned for ${date}.`);
      this.currentDay = day; this.onSuccess?.(day); return { stale: false, day };
    } catch (error) {
      if (requestId !== this.requestId) return { stale: true, day: null };
      this.logger.error('Daily routine loading failed.', { date, error }); this.onError?.(error, date); return { stale: false, day: null, error };
    } finally { if (requestId === this.requestId) { this.loading = false; this.onLoading?.(false, date); } }
  }
  getReadyDay() { return this.loading ? null : this.currentDay; }
  invalidate() { this.requestId++; this.currentDay = null; this.loading = false; this.onLoading?.(false); }
}

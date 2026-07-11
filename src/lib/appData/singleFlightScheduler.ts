type TimerHandle = ReturnType<typeof setTimeout>;

/**
 * Coalescing single-flight runner for the chat unread-summary reconciliation.
 *
 * Many signals ask for a fresh summary — channel subscribe, reconnect, app
 * foreground, membership change, a read-state event, an explicit refresh. This
 * collapses bursts into a short debounce, keeps at most one request in flight,
 * and lets signals that arrive during a request schedule exactly one follow-up.
 * cleanup() cancels pending work; after disposal nothing runs, so a torn-down
 * session can never fire a stale reconciliation.
 */
export class SingleFlightScheduler {
  private running = false;
  private queued = false;
  private disposed = false;
  private timer: TimerHandle | null = null;

  constructor(
    private readonly run: () => Promise<void>,
    private readonly debounceMs = 150,
  ) {}

  /** Ask for a reconciliation (debounced, coalesced). */
  schedule(): void {
    if (this.disposed) return;
    if (this.running) {
      this.queued = true;
      return;
    }
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.debounceMs);
  }

  cleanup(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.queued = false;
  }

  private async flush(): Promise<void> {
    if (this.disposed || this.running) return;
    this.running = true;
    try {
      await this.run();
    } catch {
      // The summary loader owns its own (silent) failure handling; a later
      // signal or foreground catch-up retries. The scheduler never throws.
    } finally {
      this.running = false;
      if (this.disposed) return;
      if (this.queued) {
        this.queued = false;
        this.schedule();
      }
    }
  }
}

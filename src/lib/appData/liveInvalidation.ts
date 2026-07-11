export const SHARED_REFRESH_DOMAINS = [
  'announcements',
  'events',
  'rotas',
  'songs',
  'directory',
] as const;

export type SharedRefreshDomain = (typeof SHARED_REFRESH_DOMAINS)[number];

type TimerHandle = ReturnType<typeof setTimeout>;

/**
 * Small per-domain invalidation scheduler. Repeated signals share one short
 * debounce; each domain has at most one request in flight, and signals that
 * arrive during it collapse into one follow-up request.
 */
export class DomainInvalidationScheduler {
  private readonly pending = new Set<SharedRefreshDomain>();
  private readonly inFlight = new Set<SharedRefreshDomain>();
  private readonly followUp = new Set<SharedRefreshDomain>();
  private timer: TimerHandle | null = null;
  private disposed = false;

  constructor(
    private readonly runDomain: (domain: SharedRefreshDomain) => Promise<void>,
    private readonly debounceMs = 180,
  ) {}

  invalidate(domains: Iterable<SharedRefreshDomain>): void {
    if (this.disposed) return;
    for (const domain of domains) {
      if (this.inFlight.has(domain)) this.followUp.add(domain);
      else this.pending.add(domain);
    }
    this.schedule();
  }

  cleanup(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending.clear();
    this.followUp.clear();
  }

  private schedule(): void {
    if (this.disposed || this.timer || this.pending.size === 0) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.debounceMs);
  }

  private flush(): void {
    if (this.disposed) return;
    const domains = [...this.pending];
    this.pending.clear();
    for (const domain of domains) {
      if (this.inFlight.has(domain)) {
        this.followUp.add(domain);
        continue;
      }
      this.inFlight.add(domain);
      void this.runDomain(domain)
        .catch(() => {
          // Domain loaders own user-visible error state. Realtime invalidation
          // itself stays quiet and a later event/foreground catch-up retries.
        })
        .finally(() => {
          this.inFlight.delete(domain);
          if (this.disposed) return;
          if (this.followUp.delete(domain)) this.pending.add(domain);
          this.schedule();
        });
    }
  }
}

export function shouldCatchUpOnAppStateChange(
  previous: string,
  next: string,
): boolean {
  return next === 'active' && previous !== 'active';
}

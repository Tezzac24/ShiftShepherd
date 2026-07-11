import {
  DomainInvalidationScheduler,
  shouldCatchUpOnAppStateChange,
} from '../liveInvalidation';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('DomainInvalidationScheduler', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('coalesces repeated signals, including a local mutation plus realtime echo', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    const scheduler = new DomainInvalidationScheduler(run, 20);
    scheduler.invalidate(['directory']);
    scheduler.invalidate(['directory']);
    scheduler.invalidate(['directory']);
    jest.advanceTimersByTime(20);
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('directory');
  });

  it('queues multiple domains in one coalesced flush', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    const scheduler = new DomainInvalidationScheduler(run, 20);
    scheduler.invalidate(['announcements', 'events', 'songs']);
    jest.advanceTimersByTime(20);
    await Promise.resolve();
    expect(new Set(run.mock.calls.map(([domain]) => domain))).toEqual(
      new Set(['announcements', 'events', 'songs']),
    );
  });

  it('allows one in-flight request and collapses arrivals into one follow-up', async () => {
    const first = deferred();
    const run = jest
      .fn<Promise<void>, [string]>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(undefined);
    const scheduler = new DomainInvalidationScheduler(run as never, 20);
    scheduler.invalidate(['rotas']);
    jest.advanceTimersByTime(20);
    expect(run).toHaveBeenCalledTimes(1);
    scheduler.invalidate(['rotas']);
    scheduler.invalidate(['rotas']);
    jest.advanceTimersByTime(100);
    expect(run).toHaveBeenCalledTimes(1);
    first.resolve();
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(20);
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('cancels pending timers and follow-ups on cleanup', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    const scheduler = new DomainInvalidationScheduler(run, 20);
    scheduler.invalidate(['events']);
    scheduler.cleanup();
    jest.runAllTimers();
    await Promise.resolve();
    expect(run).not.toHaveBeenCalled();
  });
});

describe('shouldCatchUpOnAppStateChange', () => {
  it('runs only for a genuine inactive/background to active transition', () => {
    expect(shouldCatchUpOnAppStateChange('background', 'active')).toBe(true);
    expect(shouldCatchUpOnAppStateChange('inactive', 'active')).toBe(true);
    expect(shouldCatchUpOnAppStateChange('active', 'active')).toBe(false);
    expect(shouldCatchUpOnAppStateChange('active', 'background')).toBe(false);
  });
});

/**
 * SingleFlightScheduler tests — coalescing, single-flight, one queued
 * follow-up, and disposal safety. Uses fake timers and manual promise control;
 * no real waiting.
 */
import { SingleFlightScheduler } from '../singleFlightScheduler';

jest.useFakeTimers();

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

afterEach(() => {
  jest.clearAllTimers();
});

it('coalesces a burst of schedules into one run', async () => {
  const run = jest.fn().mockResolvedValue(undefined);
  const scheduler = new SingleFlightScheduler(run, 100);

  scheduler.schedule();
  scheduler.schedule();
  scheduler.schedule();
  expect(run).not.toHaveBeenCalled();

  jest.advanceTimersByTime(100);
  await Promise.resolve();
  expect(run).toHaveBeenCalledTimes(1);
});

it('keeps at most one request in flight and one queued follow-up', async () => {
  const first = deferred();
  const second = deferred();
  const run = jest
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise)
    .mockResolvedValue(undefined);
  const scheduler = new SingleFlightScheduler(run, 50);

  scheduler.schedule();
  jest.advanceTimersByTime(50);
  await Promise.resolve();
  expect(run).toHaveBeenCalledTimes(1); // in flight

  // Three signals during the in-flight request collapse to ONE follow-up.
  scheduler.schedule();
  scheduler.schedule();
  scheduler.schedule();
  expect(run).toHaveBeenCalledTimes(1);

  first.resolve();
  await Promise.resolve();
  await Promise.resolve();
  jest.advanceTimersByTime(50);
  await Promise.resolve();
  expect(run).toHaveBeenCalledTimes(2); // exactly one follow-up

  second.resolve();
  await Promise.resolve();
  await Promise.resolve();
  jest.advanceTimersByTime(50);
  await Promise.resolve();
  expect(run).toHaveBeenCalledTimes(2); // nothing more queued
});

it('cancels pending work on cleanup and never runs afterwards', async () => {
  const run = jest.fn().mockResolvedValue(undefined);
  const scheduler = new SingleFlightScheduler(run, 100);

  scheduler.schedule();
  scheduler.cleanup();
  jest.advanceTimersByTime(500);
  await Promise.resolve();
  expect(run).not.toHaveBeenCalled();

  // Scheduling after disposal is a no-op.
  scheduler.schedule();
  jest.advanceTimersByTime(500);
  await Promise.resolve();
  expect(run).not.toHaveBeenCalled();
});

it('does not start a queued follow-up after cleanup during an in-flight run', async () => {
  const first = deferred();
  const run = jest.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
  const scheduler = new SingleFlightScheduler(run, 50);

  scheduler.schedule();
  jest.advanceTimersByTime(50);
  await Promise.resolve();
  expect(run).toHaveBeenCalledTimes(1);

  scheduler.schedule(); // queued follow-up
  scheduler.cleanup(); // disposed before the in-flight run resolves
  first.resolve();
  await Promise.resolve();
  await Promise.resolve();
  jest.advanceTimersByTime(50);
  await Promise.resolve();
  expect(run).toHaveBeenCalledTimes(1); // follow-up never fired
});

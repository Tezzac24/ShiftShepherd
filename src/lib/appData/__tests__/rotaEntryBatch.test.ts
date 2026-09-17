/**
 * Ordered rota batch saves (Plan the Month). The batch is one logical save:
 * entries are created one at a time, the first failure stops the batch, and
 * everything saved before it is reported so the leader can be told exactly
 * what exists and one push request can cover it.
 */
import { RotaEntry } from '../../../types';
import { saveRotaEntriesInOrder } from '../rotaEntryBatch';

function entry(id: string): RotaEntry {
  return {
    id,
    organisation_id: '10000000-0000-4000-a000-000000000001',
    team_id: '30000000-0000-4000-a000-000000000001',
    title: 'Sunday Morning Service',
    date: '2026-10-04',
    time: '09:15',
    notes: null,
    status: 'active',
    cancelled_at: null,
    cancelled_by: null,
    cancellation_reason: null,
    created_by: '20000000-0000-4000-a000-000000000001',
    created_at: '2026-09-17T12:00:00.000Z',
    updated_at: '2026-09-17T12:00:00.000Z',
  };
}

describe('saveRotaEntriesInOrder', () => {
  it('saves every item in order and reports all of them', async () => {
    const order: string[] = [];
    const result = await saveRotaEntriesInOrder(['a', 'b', 'c'], async (item) => {
      order.push(item);
      return { entry: entry(`entry-${item}`), live: true };
    });
    expect(order).toEqual(['a', 'b', 'c']);
    expect(result).toEqual({
      created: [entry('entry-a'), entry('entry-b'), entry('entry-c')],
      live: true,
      error: null,
    });
  });

  it('waits for each save before starting the next', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await saveRotaEntriesInOrder([1, 2, 3], async (item) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setImmediate(resolve));
      inFlight -= 1;
      return { entry: entry(`entry-${item}`), live: false };
    });
    expect(maxInFlight).toBe(1);
  });

  it('stops at the first failure and keeps what was already saved', async () => {
    const failure = new Error('Your changes could not be saved. Please try again.');
    const attempted: string[] = [];
    const result = await saveRotaEntriesInOrder(['a', 'b', 'c'], async (item) => {
      attempted.push(item);
      if (item === 'b') throw failure;
      return { entry: entry(`entry-${item}`), live: true };
    });
    expect(attempted).toEqual(['a', 'b']);
    expect(result).toEqual({ created: [entry('entry-a')], live: true, error: failure });
  });

  it('reports a failure before anything was saved', async () => {
    const failure = new Error('offline');
    const result = await saveRotaEntriesInOrder(['a'], async () => {
      throw failure;
    });
    expect(result).toEqual({ created: [], live: false, error: failure });
  });

  it('marks demo-only batches as not live, and an empty batch as a no-op', async () => {
    const demo = await saveRotaEntriesInOrder(['a'], async () => ({
      entry: entry('rota-local'),
      live: false,
    }));
    expect(demo.live).toBe(false);
    const save = jest.fn();
    expect(await saveRotaEntriesInOrder([], save)).toEqual({ created: [], live: false, error: null });
    expect(save).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, beforeEach, beforeAll, vi } from 'vitest';
import { MemoryStorage } from '../src';
import { DurableClock } from '../src/clocks/durable-clock';
import { TripleStore } from '../src/triple-store';

describe('DurableClock', () => {
  it('creates a fresh clock if no relevant metadata', async () => {
    const clock = new DurableClock('store');
    new TripleStore({
      storage: { store: new MemoryStorage() },
      clock,
    });

    expect((await clock.getCurrentTimestamp())[0]).toBe(0);
  });

  it('initializes with persisted clock if available', async () => {
    const storage = new MemoryStorage();
    const setupStore = new TripleStore({
      storage: { store: storage },
    });
    await setupStore.updateMetadataTuples([
      ['clock', ['tick'], 15],
      ['clock', ['clientId'], 'alice'],
    ]);

    const testClock = new DurableClock('store');
    new TripleStore({
      storage: { store: storage },
      clock: testClock,
    });
    const currentTs = await testClock.getCurrentTimestamp();
    expect(currentTs[0]).toBe(15);
    expect(currentTs[1]).toBe('alice');
  });
});

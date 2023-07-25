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
  it('can get the next timestamp', async () => {
    const clock = new DurableClock('store');
    new TripleStore({
      storage: { store: new MemoryStorage() },
      clock,
    });
    const currentTick = (await clock.getCurrentTimestamp())[0];
    expect(currentTick).toBe(0);
    const nextTick = (await clock.getNextTimestamp())[0];
    expect(nextTick).toBe(1);
  });
  it('can set the clock', async () => {
    const clock = new DurableClock('store');
    new TripleStore({
      storage: { store: new MemoryStorage() },
      clock,
    });
    let currentTick = (await clock.getCurrentTimestamp())[0];
    expect(currentTick).toBe(0);
    await clock.setTick(15);
    currentTick = (await clock.getCurrentTimestamp())[0];
    expect(currentTick).toBe(15);
  });
  it('can read new timestamps from the store and update the clock', async () => {
    const clock = new DurableClock('store');
    const db = new TripleStore({
      storage: { store: new MemoryStorage() },
      clock,
    });
    let currentTick = await clock.getCurrentTimestamp();
    expect(currentTick[0]).toBe(0);
    await db.transact(async (tx) => {
      await tx.insertTriple({
        id: 'a',
        attribute: ['b'],
        value: 'c',
        expired: false,
        timestamp: [16, currentTick[1]],
      });
    });
    currentTick = await clock.getCurrentTimestamp();
    expect(currentTick[0]).toBe(16);
  });
  it.todo(
    "throws an error when it's assigned to something other than a TripleStore",
    async () => {
      const clock = new DurableClock('store');
      expect(await clock.assignToStore({} as any)).toThrow();
    }
  );
});

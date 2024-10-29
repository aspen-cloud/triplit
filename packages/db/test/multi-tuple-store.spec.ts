import { it, expect, describe, vi } from 'vitest';
import MultiTupleStore, {
  MultiTupleReactivity,
} from '../src/multi-tuple-store.js';
import {
  AsyncTupleDatabase,
  AsyncTupleDatabaseClient,
} from '@triplit/tuple-database';
import { MemoryBTreeStorage } from '../src/storage/memory-btree.js';

// Using store.autoTransact because thats what we do in the actual codebase
describe('reactivity', () => {
  it('fires with correct data for multiple subscriptions', async () => {
    const client1 = createDBClient();
    const client2 = createDBClient();
    const store = new MultiTupleStore({
      storage: {
        client1,
        client2,
      },
    });

    const callback1 = vi.fn();
    const callback2 = vi.fn();
    store.subscribe({ prefix: ['test1'] }, callback1);
    store.subscribe({ prefix: ['test2'] }, callback2);

    await store.autoTransact(async (tx) => {
      await tx.set(['test1', 'key'], 'value');
      await tx.set(['test2', 'key'], 'value');
    }, undefined);

    const callback1Payload = {
      set: [{ key: ['test1', 'key'], value: 'value' }],
      remove: [],
    };
    expect(callback1).toHaveBeenCalledTimes(1);
    expect(callback1.mock.calls.at(-1)?.[0]).toStrictEqual({
      client1: callback1Payload,
      client2: callback1Payload,
    });

    const callback2Payload = {
      set: [{ key: ['test2', 'key'], value: 'value' }],
      remove: [],
    };
    expect(callback2).toHaveBeenCalledTimes(1);
    expect(callback2.mock.calls.at(-1)?.[0]).toStrictEqual({
      client1: callback2Payload,
      client2: callback2Payload,
    });
  });

  it('opening a transaction tracks the transaction for reactivity', async () => {
    const client1 = createDBClient();
    const client2 = createDBClient();
    const store = new MultiTupleStore({
      storage: {
        client1,
        client2,
      },
    });

    const tx = store.transact();
    const expectedReactivity = Object.fromEntries(
      Object.entries(tx.txs).map(([storeId, tupleStoreTx]) => [
        MultiTupleReactivity.TupleStoreCompositeKey(storeId, tupleStoreTx.id),
        tx.id,
      ])
    );
    expect(
      // @ts-expect-error - testing private property
      store.reactivity.tupleStoreTxReactivityIds
    ).toEqual(expectedReactivity);
  });

  it('committing a transaction cleans up reactivity', async () => {
    const client1 = createDBClient();
    const client2 = createDBClient();
    const store = new MultiTupleStore({
      storage: {
        client1,
        client2,
      },
    });

    await store.autoTransact(async (tx) => {
      await tx.set(['test', 'key'], 'value');
    }, undefined);
    expect(
      // @ts-expect-error - testing private property
      store.reactivity.tupleStoreTxReactivityIds
    ).toEqual({});
  });

  it('cancelling a transaction cleans up reactivity', async () => {
    const client1 = createDBClient();
    const client2 = createDBClient();
    const store = new MultiTupleStore({
      storage: {
        client1,
        client2,
      },
    });

    await store.autoTransact(async (tx) => {
      await tx.set(['test', 'key'], 'value');
      await tx.cancel();
    }, undefined);
    expect(
      // @ts-expect-error - testing private property
      store.reactivity.tupleStoreTxReactivityIds
    ).toEqual({});
  });

  it('failure to commit cleans up reactivity', async () => {
    const client1 = createDBClient();
    const client2 = createDBClient();
    const store = new MultiTupleStore({
      storage: {
        client1,
        client2,
      },
    });
    store.beforeCommit(() => {
      throw new Error('ERROR');
    });

    try {
      await store.autoTransact(async (tx) => {
        await tx.set(['test', 'key'], 'value');
      }, undefined);
    } catch {
      // Swallow the error
    }
    expect(
      // @ts-expect-error - testing private property
      store.reactivity.tupleStoreTxReactivityIds
    ).toEqual({});
  });
});

function createDBClient() {
  return new AsyncTupleDatabaseClient(
    new AsyncTupleDatabase(new MemoryBTreeStorage())
  );
}

import { it, expect, vi, describe } from 'vitest';
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

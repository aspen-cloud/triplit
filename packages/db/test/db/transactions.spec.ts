import { describe, expect, it } from 'vitest';
import DB from '../../src/db.js';
import { TransactionAlreadyCanceledError } from '../../src/errors.js';

describe('cancel transaction', () => {
  it('canceling a transaction returns canceled status', async () => {
    const db = new DB();
    {
      const transaction = await db.transact(async (tx) => {
        await tx.insert('test', { name: 'test' });
      });
      expect(transaction.isCanceled).toBe(false);
    }
    {
      const transaction = await db.transact(async (tx) => {
        await tx.insert('test', { name: 'test' });
        await tx.cancel();
      });
      expect(transaction.isCanceled).toBe(true);
    }
  });

  it('canceling a transaction rolls back and does not commit changes', async () => {
    const db = new DB();
    await db.insert('test', { id: '1', name: 'committed' });
    await db.transact(async (tx) => {
      await tx.insert('test', { id: '2', name: 'not committed' });
      await tx.cancel();
    });
    const result = await db.fetch(db.query('test').build());
    expect(result).toEqual(new Map([['1', { id: '1', name: 'committed' }]]));
  });

  it('cannot perform operations after canceling a transaction', async () => {
    const db = new DB();
    const transaction = db.transact(async (tx) => {
      await tx.insert('test', { name: 'test' });
      await tx.cancel();
      await tx.insert('test', { name: 'test' });
    });
    await expect(transaction).rejects.toThrow(TransactionAlreadyCanceledError);
  });
  it('not awaiting cancel throws an error', async () => {
    const db = new DB();
    const transaction = db.transact(async (tx) => {
      await tx.insert('test', { name: 'test' });
      tx.cancel();
    });
    await expect(transaction).rejects.toThrow(TransactionAlreadyCanceledError);
  });

  it('canceling a transaction in beforeCommit hook cancels the transaction', async () => {});
  it('canceling a transaction in afterCommit hook throws error because its already committed', async () => {});
});

describe('transaction callback', () => {
  it('throwing an error in the callback bubbles up', async () => {
    const db = new DB();
    const transaction = db.transact(async () => {
      throw new Error('test');
    });
    await expect(transaction).rejects.toThrow('test');
  });
});

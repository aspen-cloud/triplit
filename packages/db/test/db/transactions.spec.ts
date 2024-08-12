import { describe, expect, it, vi } from 'vitest';
import DB from '../../src/db.js';
import {
  TransactionAlreadyCanceledError,
  TransactionAlreadyCommittedError,
} from '../../src/errors.js';

describe('commit transaction', () => {
  it('cannot perform operations after committing a transaction', async () => {
    const db = new DB();
    // Not recommended, transaction will auto commit
    const transaction = db.transact(async (tx) => {
      await tx.insert('test', { name: 'test1' });
      await tx.commit();
      await tx.insert('test', { name: 'test2' });
    });
    await expect(transaction).rejects.toThrow(TransactionAlreadyCommittedError);
  });

  // TODO: add warning for user
  it.only('failing to await commands will still run, but not commit changes', async () => {
    const db = new DB();
    // const consoleSpy = vi.spyOn(console, 'warn');
    await db.transact(async (tx) => {
      tx.insert('test', { name: 'test' });
    });
    const result = await db.fetch(db.query('test').build());
    expect(result).toEqual(new Map());
    // expect(consoleSpy).toHaveBeenCalledWith(
    //   'You are attempting to perform an operation on an already committed transaction - changes may not be committed. Please ensure you are awaiting async operations within a transaction.'
    // );
  });

  it('beforeCommit failures should block a transaction from committing', async () => {
    const db = new DB();
    db.addTrigger({ when: 'beforeCommit' }, async () => {
      throw new Error('test');
    });
    const transaction = db.transact(async (tx) => {
      await tx.insert('test', { name: 'test' });
    });
    await expect(transaction).rejects.toThrow('test');
    const result = await db.fetch(db.query('test').build());
    expect(result).toEqual(new Map());
  });

  // This is the current behavior but I think we should update this as we expand the hooks / triggers API
  // Should probably not throw an error on db transact, but would be good to have a way to handle potential errors
  it('afterCommit failures still perform writes', async () => {
    const db = new DB();
    db.addTrigger({ when: 'afterCommit' }, async () => {
      throw new Error('test');
    });
    const transaction = db.transact(async (tx) => {
      await tx.insert('test', { id: '1', name: 'test' });
    });
    await expect(transaction).rejects.toThrow('test');
    const result = await db.fetch(db.query('test').build());
    expect(result).toEqual(new Map([['1', { id: '1', name: 'test' }]]));
  });

  it('subscriptions are not impacted by afterCommit hook failures', async () => {
    const db = new DB();
    db.addTrigger({ when: 'afterCommit' }, async () => {
      throw new Error('test');
    });
    const subscriptionSpy = vi.fn();
    db.tripleStore.onWrite(subscriptionSpy);
    const transaction = db.transact(async (tx) => {
      await tx.insert('test', { id: '1', name: 'test' });
    });
    await expect(transaction).rejects.toThrow('test');
    expect(subscriptionSpy).toHaveBeenCalledTimes(1);
  });
});

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
  it('not awaiting cancel still blocks transaction commit', async () => {
    const db = new DB();
    const transaction = db.transact(async (tx) => {
      await tx.insert('test', { name: 'test' });
      tx.cancel();
    });
    const result = await db.fetch(db.query('test').build());
    expect(result).toEqual(new Map());
  });

  it('canceling a transaction in beforeCommit hook cancels the transaction', async () => {
    const db = new DB();
    db.addTrigger({ when: 'beforeCommit' }, async ({ tx }) => {
      await tx.cancel();
    });
    const transaction = await db.transact(async (tx) => {
      await tx.insert('test', { name: 'test' });
    });
    expect(transaction.isCanceled).toBe(true);
    const result = await db.fetch(db.query('test').build());
    expect(result).toEqual(new Map());
  });

  it('canceling a transaction in afterCommit hook warns user', async () => {
    const db = new DB();
    db.addTrigger({ when: 'afterCommit' }, async ({ tx }) => {
      await tx.cancel();
    });
    const consoleSpy = vi.spyOn(console, 'warn');
    const transaction = await db.transact(async (tx) => {
      await tx.insert('test', { name: 'test' });
    });
    expect(transaction.isCanceled).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Cannot cancel a transaction that is already committed.'
    );
  });
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

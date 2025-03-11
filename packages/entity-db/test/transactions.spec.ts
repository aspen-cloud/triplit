import { describe, expect, it, vi } from 'vitest';
import { DB } from '../src';
import { Schema as S } from '../src/schema/builder.js';
import {
  TransactionAlreadyCanceledError,
  TransactionAlreadyCommittedError,
} from '../src/errors.js';
import { MemoryTransaction } from '../src/kv-store/transactions/memory-tx.js';
import { BTreeKVStore } from '../src/kv-store/storage/memory-btree.js';

describe('db tx', () => {
  describe('basic operations in transaction', () => {
    it('can implicitly commit a transaction', async () => {
      const db = new DB({
        schema: {
          collections: {
            TestScores: {
              schema: S.Schema({
                id: S.Id(),
                score: S.Number(),
                date: S.String(),
              }),
            },
          },
        },
      });
      await db.transact(async (tx) => {
        await tx.insert('TestScores', {
          score: 80,
          date: '2023-04-16',
        });
        expect((await db.fetch(db.query('TestScores'))).length).toBe(0);
        expect((await tx.fetch(db.query('TestScores'))).length).toBe(1);
      });
      expect((await db.fetch(db.query('TestScores'))).length).toBe(1);
      // expect(() => tx.collection('TestScores').query().fetch()).toThrowError();
    });
    it('can rollback an insert transaction', async () => {
      const db = new DB({
        schema: {
          collections: {
            TestScores: {
              schema: S.Schema({
                id: S.Id(),
                score: S.Number(),
                date: S.String(),
              }),
            },
          },
        },
      });
      try {
        await db.transact(async (tx) => {
          await tx.insert('TestScores', {
            score: 80,
            date: '2023-04-16',
          });
          expect((await db.fetch(db.query('TestScores'))).length).toBe(0);
          expect((await tx.fetch(db.query('TestScores'))).length).toBe(1);
          throw new Error('ROLLBACK');
        });
      } catch {}
      expect((await db.fetch(db.query('TestScores'))).length).toBe(0);
      // expect(() => tx.collection('TestScores').query().fetch()).toThrowError();
    });
    it('can rollback an update transaction', async () => {
      const db = new DB({
        schema: {
          collections: {
            TestScores: {
              schema: S.Schema({
                id: S.String(),
                score: S.Number(),
                date: S.String(),
              }),
            },
          },
        },
      });
      const DOC_ID = 'my-score';
      await db.insert('TestScores', {
        score: 80,
        date: '2023-04-16',
        id: DOC_ID,
      });
      try {
        await db.transact(async (tx) => {
          await tx.update('TestScores', DOC_ID, async (entity) => {
            entity.score = 999;
          });
          expect((await db.fetchById('TestScores', DOC_ID))?.score).toBe(80);
          expect((await tx.fetchById('TestScores', DOC_ID))?.score).toBe(999);
          throw new Error('ROLLBACK');
        });
      } catch {}

      expect((await db.fetchById('TestScores', DOC_ID))?.score).toBe(80);
    });
    it('can fetch by id in a transaction', async () => {
      const db = new DB({});
      await db.transact(async (tx) => {
        await tx.insert('TestScores', {
          score: 80,
          date: '2023-04-16',
          id: '1',
        });
        const result = await tx.fetchById('TestScores', '1');
        expect(result.score).toBe(80);
      });
      expect((await db.fetchById('TestScores', '1'))?.score).toBe(80);
    });
    it('can update an entity in a transaction', async () => {
      const db = new DB({
        schema: {
          collections: {
            TestScores: {
              schema: S.Schema({
                id: S.Id(),
                score: S.Number(),
                date: S.String(),
              }),
            },
          },
        },
      });
      await db.insert('TestScores', {
        id: 'score-1',
        score: 80,
        date: '2023-04-16',
      });
      await db.transact(async (tx) => {
        expect((await db.fetchById('TestScores', 'score-1'))!.score).toBe(80);
        await tx.update('TestScores', 'score-1', async (entity) => {
          entity.score = 100;
        });
        expect((await tx.fetchById('TestScores', 'score-1'))!.score).toBe(100);
      });
      expect((await db.fetchById('TestScores', 'score-1'))!.score).toBe(100);
    });
    it('awaits firing subscription until transaction is committed', async () => {
      const db = new DB({
        schema: {
          collections: {
            TestScores: {
              schema: S.Schema({
                id: S.Id(),
                score: S.Number(),
                date: S.String(),
              }),
            },
          },
        },
      });
      // Adding this check to ensure the onInsert isn't called with schema/metadata triples
      const insertSpy = vi.fn();
      db.onCommit(insertSpy);
      await db.transact(async (tx) => {
        await tx.insert('TestScores', {
          score: 80,
          date: '2023-04-16',
        });
        await tx.insert('TestScores', {
          score: 90,
          date: '2023-04-17',
        });
        expect(insertSpy).not.toHaveBeenCalled();
      });
      expect(insertSpy).toHaveBeenCalledTimes(1);
    });

    it('can delete and set the same attribute within a transaction', async () => {
      // set then delete
      {
        const db = new DB();
        await db.insert('test', {
          id: '1',
        });

        await db.transact(async (tx) => {
          await tx.update('test', '1', async (entity) => {
            entity.attr = {
              test: 'obj',
            };
          });
          await tx.update('test', '1', async (entity) => {
            delete entity['attr'];
          });
        });
        const result = await db.fetchById('test', '1');
        expect(result.attr).toBeNull();
      }

      // delete then set
      {
        const db = new DB();
        await db.insert('test', {
          id: '1',
          attr: 'foo',
        });

        await db.transact(async (tx) => {
          await tx.update('test', '1', async (entity) => {
            delete entity['attr'];
          });
          await tx.update('test', '1', async (entity) => {
            entity.attr = {
              test: 'obj',
            };
          });
        });
        const result = await db.fetchById('test', '1');
        expect(result.attr).toStrictEqual({ test: 'obj' });
      }
    });
    it('a delete after an insert on the same entity will cancel out to a no-op', async () => {
      const db = new DB();
      await db.insert('test', {
        id: '1',
        attr: 'foo',
      });
      await db.transact(async (tx) => {
        await tx.insert('test', {
          id: '1',
          attr: 'bar',
        });
        await tx.delete('test', '1');
      });
      const result = await db.fetchById('test', '1');
      expect(result.attr).toBe('foo');
      await db.transact(async (tx) => {
        await tx.delete('test', '1');
      });
      const result2 = await db.fetchById('test', '1');
      expect(result2).toBeNull();
    });
    it('a delete after an update on the same entity will be respected', async () => {
      const db = new DB();
      await db.insert('test', {
        id: '1',
        attr: 'foo',
      });
      await db.transact(async (tx) => {
        await tx.update('test', '1', async (entity) => {
          entity.attr = 'bar';
        });
        await tx.delete('test', '1');
      });
      const result = await db.fetchById('test', '1');
      expect(result).toBeNull();
    });
  });

  it('transactions return the result of the callback', async () => {
    const db = new DB();
    {
      const result = await db.transact(async (tx) => {
        await tx.insert('Student', { name: 'John Doe', id: '1' });
        return 'hello';
      });
      expect(result).toEqual('hello');
    }
    {
      const result = await db.transact(async (tx) => {
        await tx.insert('Student', { name: 'Jane Doe', id: '2' });
      });
      expect(result).toEqual(undefined);
    }
  });

  describe('hooks', () => {
    describe('onCommit', () => {
      it('is called with changes after a transaction is committed', async () => {
        const db = new DB();
        const onCommitSpy = vi.fn();
        db.onCommit(onCommitSpy);
        await db.transact(async (tx) => {
          await tx.insert('test', { id: '1', name: 'test' });
          await tx.insert('test', { id: '2', name: 'test' });
        });
        expect(onCommitSpy).toHaveBeenCalledTimes(1);
        expect(onCommitSpy.mock.calls[0][0]).toEqual({
          test: {
            deletes: new Set(),
            sets: new Map([
              ['1', { id: '1', name: 'test' }],
              ['2', { id: '2', name: 'test' }],
            ]),
          },
        });
      });
      it('is not called if the transaciton fails', async () => {
        const db = new DB();
        const onCommitSpy = vi.fn();
        db.onCommit(onCommitSpy);
        try {
          await db.transact(async (tx) => {
            await tx.insert('test', { id: '1', name: 'test' });
            await tx.insert('test', { id: '2', name: 'test' });
            throw new Error('test');
          });
        } catch {}
        expect(onCommitSpy).toHaveBeenCalledTimes(0);
      });
      // NOTE: its a little awkward that db.transact will fail because the commit does go through, but that is the current behavior
      it('an onCommit error will not impact the transaction ', async () => {
        const db = new DB();
        db.onCommit(() => {
          throw new Error('onCommit error');
        });
        const transaction = db.transact(async (tx) => {
          await tx.insert('test', { id: '1', name: 'test' });
        });
        await expect(transaction).rejects.toThrow('onCommit error');
        const result = await db.fetch(db.query('test'));
        expect(result).toEqual([{ id: '1', name: 'test' }]);
      });
    });
    // TODO: Determine use of this API
    describe.todo('onChange', () => {});
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
});

describe('kv tx', () => {
  describe('cancel transaction', () => {
    it('canceling a transaction assigns cancelled status', async () => {
      const tx = new MemoryTransaction(new BTreeKVStore());
      expect(tx.status).toBe('open');
      tx.cancel();
      expect(tx.status).toBe('cancelled');
    });
    it('canceling a transaction does not commit changes', async () => {
      const storage = new BTreeKVStore();
      await storage.set(['key1'], 'value1');
      const tx = new MemoryTransaction(storage);
      await tx.set(['key2'], 'value2');
      tx.cancel();
      expect(await storage.get(['key1'])).toBe('value1');
      expect(await storage.get(['key2'])).toBeUndefined();
    });
    it('cannot perform operations after canceling a transaction', async () => {
      const tx = new MemoryTransaction(new BTreeKVStore());
      tx.cancel();
      await expect(tx.set(['key'], 'value')).rejects.toThrow(
        TransactionAlreadyCanceledError
      );
    });
    it('cannot commit after canceling a transaction', async () => {
      const tx = new MemoryTransaction(new BTreeKVStore());
      tx.cancel();
      await expect(tx.commit()).rejects.toThrow(
        TransactionAlreadyCanceledError
      );
    });
  });
  describe('commit transaction', () => {
    it('committing a transaction assigns committed status', async () => {
      const tx = new MemoryTransaction(new BTreeKVStore());
      expect(tx.status).toBe('open');
      await tx.commit();
      expect(tx.status).toBe('committed');
    });
    it('committing a transaction persists changes', async () => {
      const storage = new BTreeKVStore();
      const tx = new MemoryTransaction(storage);
      await tx.set(['key'], 'value');
      await tx.commit();
      expect(await storage.get(['key'])).toBe('value');
    });
    it('cannot perform operations after committing a transaction', async () => {
      const tx = new MemoryTransaction(new BTreeKVStore());
      await tx.commit();
      await expect(tx.set(['key'], 'value')).rejects.toThrow(
        TransactionAlreadyCommittedError
      );
    });
    it('cannot cancel after committing a transaction', async () => {
      const tx = new MemoryTransaction(new BTreeKVStore());
      await tx.commit();
      expect(() => tx.cancel()).toThrow(TransactionAlreadyCommittedError);
    });
    it.todo(
      'if we have actually async transactions (ie durable transaction), test the behavior of this of failing to await async commands'
    );
  });
});

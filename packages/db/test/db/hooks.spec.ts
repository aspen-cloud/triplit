import { describe, expect, it, vi } from 'vitest';
import { DB, Schema as S } from '../../src';

describe('hooks API', async () => {
  it('before write hooks will run on transaction', async () => {
    const db = new DB();
    const beforeCommitFn = vi.fn();
    db.addTrigger(
      { when: 'beforeCommit', collectionName: 'users' },
      beforeCommitFn
    );
    const beforeInsertFn = vi.fn();
    db.addTrigger(
      { when: 'beforeInsert', collectionName: 'users' },
      beforeInsertFn
    );
    const beforeUpdateFn = vi.fn();
    db.addTrigger(
      { when: 'beforeUpdate', collectionName: 'users' },
      beforeUpdateFn
    );
    const beforeDeleteFn = vi.fn();
    db.addTrigger(
      { when: 'beforeDelete', collectionName: 'users' },
      beforeDeleteFn
    );
    await db.transact(async (tx) => {
      await tx.insert('users', { id: '1', name: 'alice' });
      await tx.insert('users', { id: '2', name: 'bob' });
    });
    expect(beforeCommitFn).toHaveBeenCalledTimes(1);
    expect(beforeCommitFn.mock.calls[0][0].opSet).toStrictEqual({
      inserts: [
        ['users#1', { id: '1', name: 'alice' }],
        ['users#2', { id: '2', name: 'bob' }],
      ],
      updates: [],
      deletes: [],
    });
    expect(beforeInsertFn).toHaveBeenCalledTimes(2);
    expect(beforeInsertFn.mock.calls[0][0].entity).toStrictEqual({
      id: '1',
      name: 'alice',
    });
    expect(beforeInsertFn.mock.calls[1][0].entity).toStrictEqual({
      id: '2',
      name: 'bob',
    });
    expect(beforeUpdateFn).toHaveBeenCalledTimes(0);
    expect(beforeDeleteFn).toHaveBeenCalledTimes(0);
    await db.transact(async (tx) => {
      await tx.update('users', '1', (entity) => {
        entity.name = 'aaron';
      });
      await tx.update('users', '2', (entity) => {
        entity.name = 'blair';
      });
    });
    expect(beforeCommitFn).toHaveBeenCalledTimes(2);
    expect(beforeCommitFn.mock.calls[1][0].opSet).toStrictEqual({
      inserts: [],
      updates: [
        ['users#1', { id: '1', name: 'aaron' }],
        ['users#2', { id: '2', name: 'blair' }],
      ],
      deletes: [],
    });
    expect(beforeInsertFn).toHaveBeenCalledTimes(2);
    expect(beforeUpdateFn).toHaveBeenCalledTimes(2);
    expect(beforeUpdateFn.mock.calls[0][0].entity).toStrictEqual({
      id: '1',
      name: 'aaron',
    });
    expect(beforeUpdateFn.mock.calls[1][0].entity).toStrictEqual({
      id: '2',
      name: 'blair',
    });
    expect(beforeDeleteFn).toHaveBeenCalledTimes(0);
    await db.transact(async (tx) => {
      await tx.delete('users', '1');
      await tx.delete('users', '2');
    });
    expect(beforeCommitFn).toHaveBeenCalledTimes(3);
    const { inserts, updates, deletes } = beforeCommitFn.mock.calls[2][0].opSet;
    expect(inserts).toStrictEqual([]);
    expect(updates).toStrictEqual([]);
    expect(deletes).toMatchObject([
      ['users#1', undefined],
      ['users#2', undefined],
    ]);
    expect(beforeInsertFn).toHaveBeenCalledTimes(2);
    expect(beforeUpdateFn).toHaveBeenCalledTimes(2);
    expect(beforeDeleteFn).toHaveBeenCalledTimes(2);
    expect(beforeDeleteFn.mock.calls[0][0].entity).toBe(undefined);
    expect(beforeDeleteFn.mock.calls[1][0].entity).toBe(undefined);
  });
  it('after write hooks will run on transaction', async () => {
    const db = new DB({
      schema: {
        collections: {
          users: {
            schema: S.Schema({
              id: S.String(),
              name: S.String(),
            }),
          },
          tasks: {
            schema: S.Schema({
              id: S.String(),
              text: S.String(),
              due: S.Date(),
              completed: S.Boolean(),
            }),
          },
        },
      },
    });
    // Await db ready to not trigger any callbacks during schema init
    await db.ready;

    const afterCommitFn = vi.fn();
    db.addTrigger({ when: 'afterCommit' }, afterCommitFn);
    const afterInsertFn = vi.fn();
    db.addTrigger(
      { when: 'afterInsert', collectionName: 'users' },
      afterInsertFn
    );
    const afterUpdateFn = vi.fn();
    db.addTrigger(
      { when: 'afterUpdate', collectionName: 'users' },
      afterUpdateFn
    );
    const afterDeleteFn = vi.fn();
    db.addTrigger(
      { when: 'afterDelete', collectionName: 'users' },
      afterDeleteFn
    );

    await db.transact(async (tx) => {
      await tx.insert('users', { id: '1', name: 'alice' });
      await tx.insert('users', { id: '2', name: 'bob' });
    });
    expect(afterCommitFn).toHaveBeenCalledTimes(1);
    expect(afterCommitFn.mock.calls[0][0].opSet).toStrictEqual({
      inserts: [
        ['users#1', { id: '1', name: 'alice' }],
        ['users#2', { id: '2', name: 'bob' }],
      ],
      updates: [],
      deletes: [],
    });
    expect(afterInsertFn).toHaveBeenCalledTimes(2);
    expect(afterInsertFn.mock.calls[0][0].entity).toStrictEqual({
      id: '1',
      name: 'alice',
    });
    expect(afterInsertFn.mock.calls[1][0].entity).toStrictEqual({
      id: '2',
      name: 'bob',
    });
    expect(afterUpdateFn).toHaveBeenCalledTimes(0);
    expect(afterDeleteFn).toHaveBeenCalledTimes(0);
    await db.transact(async (tx) => {
      await tx.update('users', '1', (entity) => {
        entity.name = 'aaron';
      });
      await tx.update('users', '2', (entity) => {
        entity.name = 'blair';
      });
    });
    expect(afterCommitFn).toHaveBeenCalledTimes(2);
    expect(afterCommitFn.mock.calls[1][0].opSet).toStrictEqual({
      inserts: [],
      updates: [
        ['users#1', { id: '1', name: 'aaron' }],
        ['users#2', { id: '2', name: 'blair' }],
      ],
      deletes: [],
    });
    expect(afterInsertFn).toHaveBeenCalledTimes(2);
    expect(afterUpdateFn).toHaveBeenCalledTimes(2);
    expect(afterUpdateFn.mock.calls[0][0].entity).toStrictEqual({
      id: '1',
      name: 'aaron',
    });
    expect(afterUpdateFn.mock.calls[1][0].entity).toStrictEqual({
      id: '2',
      name: 'blair',
    });
    expect(afterDeleteFn).toHaveBeenCalledTimes(0);
    await db.transact(async (tx) => {
      await tx.delete('users', '1');
      await tx.delete('users', '2');
    });
    expect(afterCommitFn).toHaveBeenCalledTimes(3);
    const { inserts, updates, deletes } = afterCommitFn.mock.calls[2][0].opSet;
    expect(inserts).toStrictEqual([]);
    expect(updates).toStrictEqual([]);
    expect(deletes).toMatchObject([
      ['users#1', undefined],
      ['users#2', undefined],
    ]);
    expect(afterInsertFn).toHaveBeenCalledTimes(2);
    expect(afterUpdateFn).toHaveBeenCalledTimes(2);
    expect(afterDeleteFn).toHaveBeenCalledTimes(2);
    expect(afterDeleteFn.mock.calls[0][0].entity).toBe(undefined);
    expect(afterDeleteFn.mock.calls[1][0].entity).toBe(undefined);
  });
  it('removing hooks will prevent them from running', async () => {
    const db = new DB();
    const beforeCommitFn = vi.fn();
    const beforeCommit = db.addTrigger(
      { when: 'beforeCommit', collectionName: 'users' },
      beforeCommitFn
    );
    const beforeInsertFn = vi.fn();
    const beforeInsert = db.addTrigger(
      { when: 'beforeInsert', collectionName: 'users' },
      beforeInsertFn
    );
    const beforeUpdateFn = vi.fn();
    const beforeUpdate = db.addTrigger(
      { when: 'beforeUpdate', collectionName: 'users' },
      beforeUpdateFn
    );
    const beforeDeleteFn = vi.fn();
    const beforeDelete = db.addTrigger(
      { when: 'beforeDelete', collectionName: 'users' },
      beforeDeleteFn
    );
    db.removeTrigger(beforeCommit);
    db.removeTrigger(beforeInsert);
    db.removeTrigger(beforeUpdate);
    db.removeTrigger(beforeDelete);
    await db.transact(async (tx) => {
      await tx.insert('users', { id: '1', name: 'alice' });
      await tx.update('users', '1', (entity) => {
        entity.name = 'aaron';
      });
      await tx.delete('users', '1');
    });
    expect(beforeCommitFn).toHaveBeenCalledTimes(0);
    expect(beforeInsertFn).toHaveBeenCalledTimes(0);
    expect(beforeUpdateFn).toHaveBeenCalledTimes(0);
    expect(beforeDeleteFn).toHaveBeenCalledTimes(0);
  });
});

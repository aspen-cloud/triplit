import { beforeEach, describe, expect, it } from 'vitest';
import { SimpleMemoryWriteBuffer } from '../src/memory-write-buffer.js';
import { BTreeKVStore } from '../src/kv-store/storage/memory-btree.js';
import { KVStore } from '../src/types.js';

let buffer: SimpleMemoryWriteBuffer;
let kv: KVStore;
beforeEach(() => {
  buffer = new SimpleMemoryWriteBuffer();
  kv = new BTreeKVStore();
});
describe('basic ops', () => {
  it('can write changes', async () => {
    await buffer.write(kv, {
      users: {
        sets: new Map([['1', { id: '1', name: 'Alice' }]]),
        deletes: new Set(),
      },
    });
    expect(await buffer.getChanges(kv)).toEqual({
      users: {
        sets: new Map([['1', { id: '1', name: 'Alice' }]]),
        deletes: new Set(),
      },
    });
  });
  it('can merge writes of the same entity', async () => {
    await buffer.write(kv, {
      users: {
        sets: new Map([['1', { id: '1', name: 'Alice' }]]),
        deletes: new Set(),
      },
    });
    await buffer.write(kv, {
      users: {
        sets: new Map([['1', { name: 'Bob' }]]),
        deletes: new Set(),
      },
    });
    expect(await buffer.getChanges(kv)).toEqual({
      users: {
        sets: new Map([['1', { id: '1', name: 'Bob' }]]),
        deletes: new Set(),
      },
    });
  });
  it('can merge writes on the same entity that deletes it', async () => {
    await buffer.write(kv, {
      users: {
        sets: new Map([['1', { id: '1', name: 'Alice' }]]),
        deletes: new Set(),
      },
    });
    await buffer.write(kv, {
      users: {
        sets: new Map(),
        deletes: new Set(['1']),
      },
    });
    expect(await buffer.getChanges(kv)).toEqual({
      users: {
        sets: new Map(),
        deletes: new Set(['1']),
      },
    });
  });
  it('can merge writes on the same entity that deletes it and then replaces it in one change', async () => {
    await buffer.write(kv, {
      users: {
        sets: new Map([['1', { id: '1', name: 'Alice', extra: true }]]),
        deletes: new Set(),
      },
    });
    await buffer.write(kv, {
      users: {
        sets: new Map([['1', { id: '1', name: 'Bob' }]]),
        deletes: new Set(['1']),
      },
    });
    expect(await buffer.getChanges(kv)).toEqual({
      users: {
        sets: new Map([['1', { id: '1', name: 'Bob' }]]),
        deletes: new Set(['1']),
      },
    });
  });
  it('can merge an update on top of a delete', async () => {
    await buffer.write(kv, {
      users: {
        sets: new Map(),
        deletes: new Set(['1']),
      },
    });
    await buffer.write(kv, {
      users: {
        sets: new Map([['1', { id: '1', name: 'Bob' }]]),
        deletes: new Set(),
      },
    });
    expect(await buffer.getChanges(kv)).toEqual({
      users: {
        sets: new Map([['1', { id: '1', name: 'Bob' }]]),
        deletes: new Set(['1']),
      },
    });
  });
  it('can merge writes of different entities', async () => {
    await buffer.write(kv, {
      users: {
        sets: new Map([['1', { id: '1', name: 'Alice' }]]),
        deletes: new Set(),
      },
    });
    await buffer.write(kv, {
      users: {
        sets: new Map([['2', { id: '2', name: 'Bob' }]]),
        deletes: new Set(),
      },
    });
    expect(await buffer.getChanges(kv)).toEqual({
      users: {
        sets: new Map([
          ['1', { id: '1', name: 'Alice' }],
          ['2', { id: '2', name: 'Bob' }],
        ]),
        deletes: new Set(),
      },
    });
  });
  it('can clear changes', async () => {
    await buffer.write(kv, {
      users: {
        sets: new Map([['1', { id: '1', name: 'Alice' }]]),
        deletes: new Set(),
      },
    });
    await buffer.clear(kv);
    expect(await buffer.getChanges(kv)).toEqual({});
  });
  it('can determine if its empty', async () => {
    expect(await buffer.isEmpty(kv)).toBe(true);
    await buffer.write(kv, {
      users: {
        sets: new Map([['1', { id: '1', name: 'Alice' }]]),
        deletes: new Set(),
      },
    });
    expect(await buffer.isEmpty(kv)).toBe(false);
  });
});

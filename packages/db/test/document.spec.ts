import { InMemoryTupleStorage } from 'tuple-database';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryClock } from '../src/clocks/memory-clock';
import * as Document from '../src/document';
import { TripleStore } from '../src/triple-store';

const storage = new InMemoryTupleStorage();
const store = new TripleStore({ storage, tenantId: 'TEST' });
const clock = new MemoryClock();
clock.assignToStore(store);

beforeEach(() => {
  storage.data = [];
});

describe.skip('Document API', () => {
  it('should support inserting documents and retrieving', () => {
    const testObject = {
      name: 'test',
      scores: [
        { name: 'a', count: 1 },
        { name: 'b', count: 2 },
        { name: 'c', count: 3 },
      ],
    };
    Document.insert(store, 'TEST', testObject, clock);
    expect(Document.get(store, 'TEST')).toEqual(testObject);
  });

  it.todo('should support deleting documents', () => {});
});

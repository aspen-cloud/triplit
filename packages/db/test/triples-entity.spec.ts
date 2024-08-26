import { describe, expect, it } from 'vitest';
import { TripleRow } from '../src/triple-store-utils.js';
import { Entity } from '../src/entity.js';
import DB from '../src/db.js';
import {
  InvalidTripleApplicationError,
  Schema,
  genToArr,
} from '../src/index.js';

it('the first triple  assigns the collection name and id', () => {
  const triples: TripleRow[] = [
    {
      id: 'collection#1',
      attribute: ['first'],
      value: 'first',
      timestamp: [1, 'A'],
      expired: false,
    },
  ];
  const entity = new Entity(triples);
  expect(entity.collectionName).toBe('collection');
  expect(entity.id).toBe('collection#1');
});

it('all triples must have same id', () => {
  const entity = new Entity();
  expect(() =>
    entity.applyTriple({
      id: 'collection#1',
      attribute: ['first'],
      value: 'first',
      timestamp: [1, 'A'],
      expired: false,
    })
  ).not.toThrow();
  expect(() =>
    entity.applyTriple({
      id: 'collection#1',
      attribute: ['second'],
      value: 'second',
      timestamp: [1, 'A'],
      expired: false,
    })
  ).not.toThrow();
  expect(() =>
    entity.applyTriple({
      id: 'collection#2',
      attribute: ['third'],
      value: 'third',
      timestamp: [1, 'A'],
      expired: false,
    })
  ).toThrow(InvalidTripleApplicationError);
});

it('empty data state', () => {
  const entity = new Entity();
  expect(entity.collectionName).toBe(undefined);
  expect(entity.id).toBe(undefined);
  expect(entity.isDeleted).toBe(false);
  expect(entity.triples).toEqual([]);
  // TODO: should this be undefined?
  expect(entity.data).toEqual({});
});

const COLLECTION_NAME = 'collection';
describe('operations', () => {
  describe('insert', () => {
    it('flat data', async () => {
      const db = new DB();
      await db.insert(COLLECTION_NAME, { id: '1', a: 1 });
      const triples = await genToArr(db.tripleStore.findByEntity());
      await testAllTriplePermutations(triples, (triples) => {
        const entity = new Entity(triples);
        expect(entity.collectionName).toBe(COLLECTION_NAME);
        expect(entity.id).toBe('collection#1');
        expect(entity.data).toEqual({
          id: '1',
          a: 1,
        });
      });
    });
    it('nested data', async () => {
      const db = new DB();
      await db.insert(COLLECTION_NAME, {
        id: '1',
        a: { b: 1, c: { d: 2 }, e: 3 },
        f: 4,
      });
      const triples = await genToArr(db.tripleStore.findByEntity());
      await testRandomTriplePermutations(triples, (triples) => {
        const entity = new Entity(triples);
        expect(entity.collectionName).toBe(COLLECTION_NAME);
        expect(entity.id).toBe('collection#1');
        expect(entity.data).toEqual({
          id: '1',
          a: { b: 1, c: { d: 2 }, e: 3 },
          f: 4,
        });
      });
    });
  });
  describe('updates', () => {
    it('update single value', async () => {
      const db = new DB();
      await db.insert(COLLECTION_NAME, { id: '1', a: 1 });
      await db.update(COLLECTION_NAME, '1', (entity) => {
        entity.a = 2;
      });
      const triples = await genToArr(db.tripleStore.findByEntity());
      await testAllTriplePermutations(triples, (triples) => {
        const entity = new Entity(triples);
        expect(entity.data).toEqual({
          id: '1',
          a: 2,
        });
      });
    });
    it('update nested value', async () => {
      const db = new DB();
      await db.insert(COLLECTION_NAME, {
        id: '1',
        a: { b: 1, c: { d: 2 }, e: 3 },
        f: 4,
      });
      await db.update(COLLECTION_NAME, '1', (entity) => {
        entity.a.b = 2;
        entity.a.c.d = 3;
      });
      const triples = await genToArr(db.tripleStore.findByEntity());
      let i = 0;
      await testRandomTriplePermutations(triples, (triples) => {
        const entity = new Entity(triples);
        expect(entity.data).toEqual({
          id: '1',
          a: { b: 2, c: { d: 3 }, e: 3 },
          f: 4,
        });
      });
    });
    it('assign new key', async () => {
      const db = new DB();
      await db.insert(COLLECTION_NAME, { id: '1', a: 1 });
      await db.update(COLLECTION_NAME, '1', (entity) => {
        entity.b = 2;
      });
      const triples = await genToArr(db.tripleStore.findByEntity());
      await testAllTriplePermutations(triples, (triples) => {
        const entity = new Entity(triples);
        expect(entity.data).toEqual({
          id: '1',
          a: 1,
          b: 2,
        });
      });
    });
    it('assign nested data to nested data', async () => {
      const db = new DB();
      await db.insert(COLLECTION_NAME, {
        id: '1',
        a: { b: 1, c: { d: 2 }, e: 3 },
        f: 4,
      });
      await db.update(COLLECTION_NAME, '1', (entity) => {
        entity.a = { g: 5, h: { i: 6 } };
      });
      const triples = await genToArr(db.tripleStore.findByEntity());
      await testRandomTriplePermutations(triples, (triples) => {
        const entity = new Entity(triples);
        expect(entity.data).toEqual({
          id: '1',
          a: { g: 5, h: { i: 6 } },
          f: 4,
        });
      });
    });
    it('assign nested data to single value', async () => {
      const db = new DB();
      await db.insert(COLLECTION_NAME, {
        id: '1',
        a: { b: 1, c: { d: 2 }, e: 3 },
      });
      await db.update(COLLECTION_NAME, '1', (entity) => {
        entity.a = 4;
      });
      const triples = await genToArr(db.tripleStore.findByEntity());
      await testRandomTriplePermutations(triples, (triples) => {
        const entity = new Entity(triples);
        expect(entity.data).toEqual({
          id: '1',
          a: 4,
        });
      });
    });
    it('assign single value to nested data', async () => {
      const db = new DB();
      await db.insert(COLLECTION_NAME, {
        id: '1',
        a: 1,
      });
      await db.update(COLLECTION_NAME, '1', (entity) => {
        entity.a = { b: 2, c: { d: 3 } };
      });
      const triples = await genToArr(db.tripleStore.findByEntity());
      await testAllTriplePermutations(triples, (triples) => {
        const entity = new Entity(triples);
        expect(entity.data).toEqual({
          id: '1',
          a: { b: 2, c: { d: 3 } },
        });
      });
    });
    it('delete single value', async () => {
      const db = new DB();
      await db.insert(COLLECTION_NAME, { id: '1', a: 1 });
      await db.update(COLLECTION_NAME, '1', (entity) => {
        delete entity.a;
      });
      const triples = await genToArr(db.tripleStore.findByEntity());
      await testAllTriplePermutations(triples, (triples) => {
        const entity = new Entity(triples);
        expect(entity.data).toEqual({
          id: '1',
        });
      });
    });
    it('delete nested data', async () => {
      const db = new DB();
      await db.insert(COLLECTION_NAME, {
        id: '1',
        a: { b: 1, c: { d: 2 }, e: 3 },
        f: 4,
      });
      await db.update(COLLECTION_NAME, '1', (entity) => {
        delete entity.a.c;
      });
      const triples = await genToArr(db.tripleStore.findByEntity());
      await testRandomTriplePermutations(triples, (triples) => {
        const entity = new Entity(triples);
        expect(entity.data).toEqual({
          id: '1',
          a: { b: 1, e: 3 },
          f: 4,
        });
      });
    });
  });
  describe('delete', () => {
    it('assigns isDeleted to true', async () => {
      const db = new DB();
      await db.insert(COLLECTION_NAME, { id: '1', a: 1 });
      await db.delete(COLLECTION_NAME, '1');
      const triples = await genToArr(db.tripleStore.findByEntity());
      await testAllTriplePermutations(triples, (triples) => {
        const entity = new Entity(triples);
        expect(entity.isDeleted).toBe(true);
      });
    });
    it('re-inserting the entity assigns isDeleted to false', async () => {
      const db = new DB();
      await db.insert(COLLECTION_NAME, { id: '1', a: 1 });
      await db.delete(COLLECTION_NAME, '1');
      await db.insert(COLLECTION_NAME, { id: '1', b: 2 });
      const triples = await genToArr(db.tripleStore.findByEntity());
      await testRandomTriplePermutations(triples, (triples) => {
        const entity = new Entity(triples);
        expect(entity.isDeleted).toBe(false);
        expect(entity.data).toEqual({
          id: '1',
          b: 2,
        });
      });
    });
    // TODO: what should data be?
    it.todo('delete sets data to undefined', async () => {});
  });
});

async function testRandomTriplePermutations(
  triples: TripleRow[],
  test: (triples: TripleRow[]) => void | Promise<void>,
  count: number = 10000
) {
  // shuffle the triples
  for (let i = 0; i < count; i++) {
    const shuffled = triples.slice().sort(() => Math.random() - 0.5);
    try {
      await test(shuffled);
    } catch (e) {
      console.log('Failed with shuffled triples', shuffled);
      throw e;
    }
  }
}

async function testAllTriplePermutations(
  triples: TripleRow[],
  test: (triples: TripleRow[]) => void | Promise<void>
) {
  // ~ 7! = 5040, which is decently fast
  if (triples.length > 7) {
    throw Error(
      'Too many triples to permute, to save time use testRandomTriplePermutations'
    );
  }
  const permutations = permute(triples);
  for (const permutation of permutations) {
    try {
      await test(permutation);
    } catch (e) {
      console.log('Failed with permutation', permutation);
      throw e;
    }
  }
}

function permute<T>(arr: T[]) {
  const result: T[][] = [];
  if (arr.length <= 1) return [arr];

  for (let i = 0; i < arr.length; i++) {
    const current = arr[i];
    const remaining = arr.slice(0, i).concat(arr.slice(i + 1));
    const remainingPerms = permute(remaining);
    for (const perm of remainingPerms) {
      result.push([current].concat(perm));
    }
  }

  return result;
}

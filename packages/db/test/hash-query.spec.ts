import { describe, expect, it } from 'vitest';
import {
  hashAfter,
  hashFilter,
  hashFilters,
  hashOrder,
  hashPreparedQuery,
  hashSelect,
} from '../src/index.js';

describe('collectionName', () => {
  it('collectionName is applied to a query hash', () => {
    const hash1 = hashPreparedQuery({
      collectionName: 'todos',
    });
    const hash2 = hashPreparedQuery({
      collectionName: 'todos',
    });
    const hash3 = {
      collectionName: 'users',
    };
    expect(hash1).toEqual(hash2);
    expect(hash1).not.toEqual(hash3);
  });
});

describe('where', () => {
  it('filters are applied to a query hash', () => {
    const hash1 = hashPreparedQuery({
      collectionName: 'todos',
      where: [['id', '>', 1]],
    });
    const hash2 = hashPreparedQuery({
      collectionName: 'todos',
      where: [['id', '>', 1]],
    });
    const hash3 = hashPreparedQuery({
      collectionName: 'todos',
      where: [['id', '<', 1]],
    });
    expect(hash1).toEqual(hash2);
    expect(hash1).not.toEqual(hash3);
  });
  it('filter order does not matter', () => {
    const hash1 = hashFilters([
      ['id', '=', 1],
      ['author', '=', 'alice'],
    ]);
    const hash2 = hashFilters([
      ['author', '=', 'alice'],
      ['id', '=', 1],
    ]);
    expect(hash1).toEqual(hash2);
  });
  it('can uniquely hash statement values', () => {
    const hash1 = hashFilter(['id', '=', true]);
    const hash2 = hashFilter(['id', '=', 'true']);
    expect(hash1).not.toEqual(hash2);
  });
  it('can uniquely hash filter groups', () => {
    const hash1 = hashFilter({
      mod: 'and',
      filters: [
        ['id', '=', 1],
        ['author', '=', 'alice'],
      ],
    });
    // Different order filters should hash the same
    const hash2 = hashFilter({
      mod: 'and',
      filters: [
        ['author', '=', 'alice'],
        ['id', '=', 1],
      ],
    });
    // Different mod should hash differently
    const hash3 = hashFilter({
      mod: 'or',
      filters: [
        ['id', '=', 1],
        ['author', '=', 'alice'],
      ],
    });
    expect(hash1).toEqual(hash2);
    expect(hash1).not.toEqual(hash3);
  });
});

describe('order', () => {
  it('order is applied to a query hash', () => {
    const hash1 = hashPreparedQuery({
      collectionName: 'todos',
      order: [['id', 'ASC']],
    });
    const hash2 = hashPreparedQuery({
      collectionName: 'todos',
      order: [['id', 'ASC']],
    });
    const hash3 = hashPreparedQuery({
      collectionName: 'todos',
      order: [['createdAt', 'DESC']],
    });
    expect(hash1).toEqual(hash2);
    expect(hash1).not.toEqual(hash3);
  });
  it('order order does matter', () => {
    const hash1 = hashOrder([
      ['id', 'ASC'],
      ['createdAt', 'DESC'],
    ]);
    const hash2 = hashOrder([
      ['createdAt', 'DESC'],
      ['id', 'ASC'],
    ]);
    expect(hash1).not.toEqual(hash2);
  });
});

describe('limit', () => {
  it('limit is applied to a query hash', () => {
    const hash1 = hashPreparedQuery({
      collectionName: 'todos',
      limit: 10,
    });
    const hash2 = hashPreparedQuery({
      collectionName: 'todos',
      limit: 10,
    });
    const hash3 = hashPreparedQuery({
      collectionName: 'todos',
      limit: 20,
    });
    expect(hash1).toEqual(hash2);
    expect(hash1).not.toEqual(hash3);
  });
  it('limit 0 and undefined are different', () => {
    const hash1 = hashPreparedQuery({
      collectionName: 'todos',
      limit: 0,
    });
    const hash2 = hashPreparedQuery({
      collectionName: 'todos',
    });
    expect(hash1).not.toEqual(hash2);
  });
});

describe('after', () => {
  it('after is applied to a query hash', () => {
    const hash1 = hashPreparedQuery({
      collectionName: 'todos',
      after: [[1, 2], true],
    });
    const hash2 = hashPreparedQuery({
      collectionName: 'todos',
      after: [[1, 2], true],
    });
    const hash3 = hashPreparedQuery({
      collectionName: 'todos',
      after: [[2, 1], true],
    });
    expect(hash1).toEqual(hash2);
    expect(hash1).not.toEqual(hash3);
  });
  it('after cursor order changes the hash', () => {
    const hash1 = hashAfter([[1, 2], true]);
    const hash2 = hashAfter([[2, 1], true]);
    expect(hash1).not.toEqual(hash2);
  });
  it('after cursor values are uniquely hashed', () => {
    const hash1 = hashAfter([[1, 2], true]);
    const hash2 = hashAfter([[1, '2'], true]);
    expect(hash1).not.toEqual(hash2);
  });
  it('after cursor inclusivity changes the hash', () => {
    const hash1 = hashAfter([[1, 2], true]);
    const hash2 = hashAfter([[1, 2], false]);
    expect(hash1).not.toEqual(hash2);
  });
});

describe('select', () => {
  it('select is applied to a query hash', () => {
    const hash1 = hashPreparedQuery({
      collectionName: 'todos',
      select: ['id', 'createdAt'],
    });
    const hash2 = hashPreparedQuery({
      collectionName: 'todos',
      select: ['id', 'createdAt'],
    });
    const hash3 = hashPreparedQuery({
      collectionName: 'todos',
      select: ['id'],
    });
    expect(hash1).toEqual(hash2);
    expect(hash1).not.toEqual(hash3);
  });
  it('undefined select and empty select hash differently', () => {
    const hash1 = hashPreparedQuery({
      collectionName: 'todos',
    });
    const hash2 = hashPreparedQuery({
      collectionName: 'todos',
      select: [],
    });
    expect(hash1).not.toEqual(hash2);
  });
  it('select order does not change the hash', () => {
    const hash1 = hashSelect(['id', 'createdAt']);
    const hash2 = hashSelect(['createdAt', 'id']);
    expect(hash1).toEqual(hash2);
  });
});

describe('include', () => {
  it('include is applied to a query hash', () => {
    const hash1 = hashPreparedQuery({
      collectionName: 'todos',
      include: {
        author: {
          subquery: {
            collectionName: 'users',
            where: [['id', '=', 1]],
          },
          cardinality: 'one',
        },
      },
    });
    const hash2 = hashPreparedQuery({
      collectionName: 'todos',
      include: {
        author: {
          subquery: {
            collectionName: 'users',
            where: [['id', '=', 1]],
          },
          cardinality: 'one',
        },
      },
    });
    const hash3 = hashPreparedQuery({
      collectionName: 'todos',
      include: {
        assignee: {
          subquery: {
            collectionName: 'users',
            where: [['id', '=', 2]],
          },
          cardinality: 'one',
        },
      },
    });
    expect(hash1).toEqual(hash2);
    expect(hash1).not.toEqual(hash3);
  });
  it('multiple equal inclusions produce the same hash', () => {
    const hash1 = hashPreparedQuery({
      collectionName: 'todos',
      include: {
        author: {
          subquery: {
            collectionName: 'users',
            where: [['id', '=', 1]],
          },
          cardinality: 'one',
        },
        assignee: {
          subquery: {
            collectionName: 'users',
            where: [['id', '=', 2]],
          },
          cardinality: 'one',
        },
      },
    });
    const hash2 = hashPreparedQuery({
      collectionName: 'todos',
      include: {
        assignee: {
          subquery: {
            collectionName: 'users',
            where: [['id', '=', 2]],
          },
          cardinality: 'one',
        },
        author: {
          subquery: {
            collectionName: 'users',
            where: [['id', '=', 1]],
          },
          cardinality: 'one',
        },
      },
    });
    expect(hash1).toEqual(hash2);
  });
});

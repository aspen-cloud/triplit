import { describe, expect, it, beforeEach, beforeAll, vi } from 'vitest';
import { generateQueryRootPermutations } from '../src/collection-query.js';
import DB from '../src/index.js';

describe('query root permutations', () => {
  it('can generate a permutation for each subquery filter', () => {
    const query = {
      collectionName: 'manufacturers',
      where: [
        {
          exists: {
            collectionName: 'cars',
            where: [
              ['type', '=', 'SUV'],
              ['manufacturer', '=', '$id'],
            ],
          },
        },
      ],
    };
    const permutations = generateQueryRootPermutations<any, any>(query);
    // prettyPrint(permutations);
    expect(permutations).toHaveLength(2);
  });
  it('can generate a permutation for each subquery filter', () => {
    const query = {
      collectionName: 'manufacturers',
      include: {
        suvs: {
          cardinality: 'many',
          subquery: {
            collectionName: 'cars',
            where: [
              ['type', '=', 'SUV'],
              ['manufacturer', '=', '$id'],
            ],
          },
        },
      },
    };
    const permutations = generateQueryRootPermutations<any, any>(query);
    // prettyPrint(permutations);
    expect(permutations).toHaveLength(2);
  });
});

describe('query builder', () => {
  it('properly formats order clauses', () => {
    const db = new DB();
    const query1 = db.query('test').order('name', 'ASC').build();
    expect(query1.order).toEqual([['name', 'ASC']]);
    const query2 = db
      .query('test')
      .order(['name', 'ASC'], ['age', 'ASC'])
      .build();
    expect(query2.order).toEqual([
      ['name', 'ASC'],
      ['age', 'ASC'],
    ]);
    const query3 = db
      .query('test')
      .order([
        ['name', 'ASC'],
        ['age', 'ASC'],
      ])
      .build();
    expect(query3.order).toEqual([
      ['name', 'ASC'],
      ['age', 'ASC'],
    ]);
    const query4 = db
      .query('test')
      .order('name', 'ASC')
      .order('age', 'ASC')
      .build();
    expect(query4.order).toEqual([
      ['name', 'ASC'],
      ['age', 'ASC'],
    ]);
  });
});

function prettyPrint(obj: any) {
  return console.log(
    JSON.stringify(
      obj,
      (key, value) => {
        if (Array.isArray(value) && value.every((v) => typeof v !== 'object')) {
          // Convert array to a JSON string with no spacing for indentation
          return '[' + value.join(', ') + ']';
          // return value;
        }
        return value; // Return non-array values unchanged
      },
      2
    )
  );
}

import { describe, expect, it, beforeEach, beforeAll, vi } from 'vitest';
import { generateQueryRootPermutations } from '../src/collection-query.js';
import DB from '../src/index.js';
import { Schema as S } from '../src/schema/builder.js';
import { schemaToJSON } from '../src/schema/export/index.js';
import { or } from '../src/query.js';
import { prepareQuery } from '../src/query/prepare.js';

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
              ['manufacturer', '=', '$1.id'],
            ],
          },
        },
      ],
    };
    const permutations = generateQueryRootPermutations(query);
    expect(permutations).toHaveLength(2);
    expect(permutations).toContainEqual({
      collectionName: 'manufacturers',
      where: [
        {
          exists: {
            collectionName: 'cars',
            where: [
              ['type', '=', 'SUV'],
              ['manufacturer', '=', '$1.id'],
            ],
          },
        },
      ],
    });
    expect(permutations).toContainEqual({
      collectionName: 'cars',
      where: [
        ['type', '=', 'SUV'],
        {
          exists: {
            collectionName: 'manufacturers',
            where: [['id', '=', '$1.manufacturer']],
          },
        },
      ],
    });
  });
  it('can generate a permutation for inclusions', () => {
    const query = {
      collectionName: 'manufacturers',
      include: {
        suvs: {
          cardinality: 'many',
          subquery: {
            collectionName: 'cars',
            where: [
              ['type', '=', 'SUV'],
              ['manufacturer', '=', '$1.id'],
            ],
          },
        },
      },
    };
    const permutations = generateQueryRootPermutations(query);
    expect(permutations).toHaveLength(2);
    expect(permutations).toContainEqual({
      collectionName: 'manufacturers',
      include: {
        suvs: {
          cardinality: 'many',
          subquery: {
            collectionName: 'cars',
            where: [
              ['type', '=', 'SUV'],
              ['manufacturer', '=', '$1.id'],
            ],
          },
        },
      },
      where: [],
    });
    expect(permutations).toContainEqual({
      collectionName: 'cars',
      where: [
        ['type', '=', 'SUV'],
        {
          exists: {
            collectionName: 'manufacturers',
            include: {
              suvs: {
                cardinality: 'many',
                subquery: {
                  collectionName: 'cars',
                  where: [
                    ['type', '=', 'SUV'],
                    ['manufacturer', '=', '$1.id'],
                  ],
                },
              },
            },
            where: [['id', '=', '$1.manufacturer']],
          },
        },
      ],
    });
  });
});

describe('query builder', () => {
  it('properly formats order clauses', () => {
    const db = new DB();
    const query1 = db.query('test').order('name', 'ASC').build();
    expect(query1.order).toEqual([['name', 'ASC']]);
    const query2 = db
      .query('test')
      // TODO: actually address this
      // TODO: This should be an error?
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

// TODO: add more tests, move tests here
describe('prepare query', () => {
  describe('where', () => {
    it('prepare query doesnt edit schema', async () => {
      const schema = {
        collections: {
          profiles: {
            schema: S.Schema({
              id: S.Id(),
              userId: S.String(),
              user: S.RelationById('users', '$userId'),
            }),
            permissions: {
              test_role: {
                read: {
                  filter: [
                    or([
                      ['user.name', '=', 'Matt'],
                      ['user.name', '=', 'Will'],
                      ['user.name', '=', 'Phil'],
                    ]),
                  ],
                },
              },
            },
          },
          users: {
            schema: S.Schema({
              id: S.Id(),
              name: S.String(),
            }),
          },
        },
        version: 0,
      };
      const schemaCopy = schemaToJSON(schema);
      prepareQuery({ collectionName: 'profiles' }, schema.collections, {
        roles: [{ key: 'test_role', roleVars: {} }],
      });
      expect(schemaToJSON(schema)).toEqual(schemaCopy);
    });
  });
});

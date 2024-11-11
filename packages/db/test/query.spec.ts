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
              ['manufacturer', '=', '$1.id'],
            ],
          },
        },
      },
    };
    const permutations = generateQueryRootPermutations(query);
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
    it.only('prepare query doesnt edit schema', async () => {
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

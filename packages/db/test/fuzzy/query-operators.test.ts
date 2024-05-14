import { test, fc } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import DB, { Schema as S } from '../../src/index.js';

const SCALAR_OPS = ['<', '<=', '=', '!=', '>=', '>'] as const;
const SCALAR_TYPES = ['String', 'Number', 'Boolean', 'Date'] as const;

/**
 * Note: This is only testing a single where filter and doesn't care about ordering or limiting
 */
describe.each(SCALAR_TYPES)('%s', (type) => {
  describe.each(SCALAR_OPS)('%s', (op) => {
    describe.each(['required', 'optional', 'nullable'] as const)(
      '%s',
      async (field) => {
        const { db, data } = await initializeDB(type, field);
        test.prop([triplitTypeToFastCheckType(type)])(
          'correctly filters',
          async (value) => {
            const expected = new Set(
              data
                .filter((d) => compare(d.testAttr, value, op))
                .map((d) => d.testAttr.toString())
            );
            const query = db
              .query('testCollection')
              .where(['testAttr', op, value])
              .build();
            const result = await db.fetch(query);
            expect(
              new Set(
                Array.from(result.values()).map((result) =>
                  result.testAttr.toString()
                )
              )
            ).toEqual(expected);
          }
        );
      }
    );
  });
});

function compare<T = any>(
  a: T,
  b: T,
  op: (typeof SCALAR_OPS)[number]
): boolean {
  if (typeof a === 'object' && a instanceof Date) {
    // @ts-ignore
    a = a.toISOString();
    // @ts-ignore
    b = b.toISOString();
  }
  switch (op) {
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    case '=':
      return a === b;
    case '!=':
      return a !== b;
    case '>=':
      return a >= b;
    case '>':
      return a > b;
  }
}

/**
 * Initialize the database with a field of a given type and requirement and seed data
 */
async function initializeDB(
  type: (typeof SCALAR_TYPES)[number],
  requirement: 'required' | 'optional' | 'nullable'
) {
  const attributeType = S[type]({ nullable: requirement === 'nullable' });
  const collection = {
    testCollection: {
      schema: S.Schema({
        id: S.Id(),
        testAttr:
          requirement === 'optional'
            ? S.Optional(attributeType)
            : attributeType,
      }),
    },
  };
  const db = new DB({ schema: { collections: collection, version: 0 } });
  const data = fc.sample(
    fc.record({ testAttr: triplitTypeToFastCheckType(type) }),
    100
  );

  for (const d of data) {
    await db.insert('testCollection', d);
  }
  return { db, data };
}

const triplitTypeToFastCheckType = (
  triplitType: (typeof SCALAR_TYPES)[number],
  {
    nullable = false,
    optional = false,
  }: { nullable?: boolean; optional?: boolean } = {}
) => {
  let scalarType;
  switch (triplitType) {
    case 'String':
      //   return fc.string();
      scalarType = fc.stringMatching(/^[a-zA-Z0-9]+$/);
      break;
    case 'Number':
      //   scalarType = fc.float({
      //     max: Math.fround(1e16),
      //     min: Math.fround(-1e16),
      //   });
      scalarType = fc.integer();
      break;
    case 'Boolean':
      scalarType = fc.boolean();
      break;
    case 'Date':
      scalarType = fc.date({ noInvalidDate: true });
      break;
  }
  if (optional) {
    scalarType = fc.oneof(scalarType, fc.constant(undefined));
  }
  if (nullable) {
    scalarType = fc.oneof(scalarType, fc.constant(null));
  }
  return scalarType;
};

import { describe, expect, it, test } from 'vitest';
import { Schema as S } from '../../src/schema/builder.js';
import { Type } from '../../src/schema/index.js';
import {
  shuffleArray,
  genData,
  testEq,
  testFilterOp,
  testGt,
  testGte,
  testLt,
  testLte,
  testNEq,
  TEST_OPTIONS,
} from './utils.js';

/**
 * IF THIS FAILS, ADD TESTS FOR THE MISSING OPERATIONS
 */
it('expected operations are tested', () => {
  expect(new Set(Type.supportedOperations(S.Date()))).toEqual(
    new Set(['=', '!=', '>', '>=', '<', '<=', 'isDefined'])
  );
});

describe.each(TEST_OPTIONS)('$engine', (options) => {
  const requiredSchema = {
    collections: {
      test: {
        schema: S.Schema({
          id: S.Id(),
          attr: S.Date(),
          _idx: S.Number(),
        }),
      },
    },
  };
  const nullableSchema = {
    collections: {
      test: {
        schema: S.Schema({
          id: S.Id(),
          attr: S.Date({ nullable: true }),
          _idx: S.Number(),
        }),
      },
    },
  };
  const optionalSchema = {
    collections: {
      test: {
        schema: S.Schema({
          id: S.Id(),
          attr: S.Optional(S.Date()),
          _idx: S.Number(),
        }),
      },
    },
  };
  describe('=', () => {
    it('required', async () => {
      const data = genData([
        new Date(2021, 1, 1),
        new Date(2021, 1, 2),
        new Date(2021, 1, 2),
        new Date(2021, 1, 3),
      ]);
      shuffleArray(data);

      // matches on equal
      await testEq(
        requiredSchema,
        data,
        {
          cmp: new Date(2021, 1, 2),
          expected: [1, 2],
        },
        options
      );
      // misses on unequal
      await testEq(
        requiredSchema,
        data,
        {
          cmp: new Date(2021, 1, 4),
          expected: [],
        },
        options
      );
      await testEq(
        requiredSchema,
        data,
        {
          cmp: null,
          expected: [],
        },
        options
      );
      await testEq(
        requiredSchema,
        data,
        {
          cmp: undefined,
          expected: [],
        },
        options
      );
    });
    it('nullable', async () => {
      const data = genData([
        new Date(2021, 1, 1),
        new Date(2021, 1, 2),
        new Date(2021, 1, 2),
        new Date(2021, 1, 3),
        null,
      ]);
      shuffleArray(data);

      // matches on equal, no nulls
      await testEq(
        nullableSchema,
        data,
        {
          cmp: new Date(2021, 1, 2),
          expected: [1, 2],
        },
        options
      );
      // misses on unequal, no nulls
      await testEq(
        nullableSchema,
        data,
        {
          cmp: new Date(2021, 1, 4),
          expected: [],
        },
        options
      );
      // matches on null
      await testEq(
        nullableSchema,
        data,
        {
          cmp: null,
          expected: [4],
        },
        options
      );
      // matches on undefined
      await testEq(
        nullableSchema,
        data,
        {
          cmp: undefined,
          expected: [4],
        },
        options
      );
    });
    it('optional', async () => {
      const data = genData([
        new Date(2021, 1, 1),
        new Date(2021, 1, 2),
        new Date(2021, 1, 2),
        new Date(2021, 1, 3),
        undefined,
      ]);
      shuffleArray(data);

      // matches on equal, no undefined
      await testEq(
        optionalSchema,
        data,
        {
          cmp: new Date(2021, 1, 2),
          expected: [1, 2],
        },
        options
      );
      // misses on unequal, no undefined
      await testEq(
        optionalSchema,
        data,
        {
          cmp: new Date(2021, 1, 4),
          expected: [],
        },
        options
      );
      // matches on null
      await testEq(
        optionalSchema,
        data,
        {
          cmp: null,
          expected: [4],
        },
        options
      );
      // matches on undefined
      await testEq(
        optionalSchema,
        data,
        {
          cmp: undefined,
          expected: [4],
        },
        options
      );
    });
  });
  describe('!=', () => {
    it('required', async () => {
      const data = genData([
        new Date(2021, 1, 1),
        new Date(2021, 1, 2),
        new Date(2021, 1, 2),
        new Date(2021, 1, 3),
      ]);
      shuffleArray(data);

      // matches on unequal
      await testNEq(
        requiredSchema,
        data,
        {
          cmp: new Date(2021, 1, 2),
          expected: [0, 3],
        },
        options
      );
      // all returned if no matches
      await testNEq(
        requiredSchema,
        data,
        {
          cmp: new Date(2021, 1, 4),
          expected: [0, 1, 2, 3],
        },
        options
      );
      // matches on null
      await testNEq(
        requiredSchema,
        data,
        {
          cmp: null,
          expected: [0, 1, 2, 3],
        },
        options
      );
      // matches on undefined
      await testNEq(
        requiredSchema,
        data,
        {
          cmp: undefined,
          expected: [0, 1, 2, 3],
        },
        options
      );
    });
    it('nullable', async () => {
      const data = genData([
        new Date(2021, 1, 1),
        new Date(2021, 1, 2),
        new Date(2021, 1, 2),
        new Date(2021, 1, 3),
        null,
      ]);
      shuffleArray(data);

      // matches on unequal, includes nulls
      await testNEq(
        nullableSchema,
        data,
        {
          cmp: new Date(2021, 1, 2),
          expected: [0, 3, 4],
        },
        options
      );
      await testNEq(
        nullableSchema,
        data,
        {
          cmp: null,
          expected: [0, 1, 2, 3],
        },
        options
      );
      await testNEq(
        nullableSchema,
        data,
        {
          cmp: undefined,
          expected: [0, 1, 2, 3],
        },
        options
      );
    });
    it('optional', async () => {
      const data = genData([
        new Date(2021, 1, 1),
        new Date(2021, 1, 2),
        new Date(2021, 1, 2),
        new Date(2021, 1, 3),
        undefined,
      ]);
      shuffleArray(data);

      // matches on unequal, includes undefined
      await testNEq(
        optionalSchema,
        data,
        {
          cmp: new Date(2021, 1, 2),
          expected: [0, 3, 4],
        },
        options
      );
      // all returned if no matches
      await testNEq(
        optionalSchema,
        data,
        {
          cmp: new Date(2021, 1, 4),
          expected: [0, 1, 2, 3, 4],
        },
        options
      );
      await testNEq(
        optionalSchema,
        data,
        {
          cmp: null,
          expected: [0, 1, 2, 3],
        },
        options
      );
      await testNEq(
        optionalSchema,
        data,
        {
          cmp: undefined,
          expected: [0, 1, 2, 3],
        },
        options
      );
    });
  });
  describe('>', () => {
    it('required', async () => {
      const data = genData([
        new Date(2021, 1, 1),
        new Date(2021, 1, 2),
        new Date(2021, 1, 3),
        new Date(2021, 1, 4),
      ]);
      shuffleArray(data);

      // matches on greater
      await testGt(
        requiredSchema,
        data,
        {
          cmp: new Date(2021, 1, 2),
          expected: [2, 3],
        },
        options
      );

      // misses if out of range
      await testGt(
        requiredSchema,
        data,
        {
          cmp: new Date(2021, 1, 4),
          expected: [],
        },
        options
      );
      await testGt(
        requiredSchema,
        data,
        {
          cmp: null,
          expected: [0, 1, 2, 3],
        },
        options
      );
      await testGt(
        requiredSchema,
        data,
        {
          cmp: undefined,
          expected: [0, 1, 2, 3],
        },
        options
      );
    });
    it('nullable', async () => {
      const data = genData([
        new Date(2021, 1, 1),
        new Date(2021, 1, 2),
        new Date(2021, 1, 3),
        new Date(2021, 1, 4),
        null,
      ]);
      shuffleArray(data);

      // matches on greater, nulls not gt
      await testGt(
        nullableSchema,
        data,
        {
          cmp: new Date(2021, 1, 2),
          expected: [2, 3],
        },
        options
      );
      // misses out of range, nulls not gt
      await testGt(
        nullableSchema,
        data,
        {
          cmp: new Date(2021, 1, 4),
          expected: [],
        },
        options
      );
      // gt null includes all non-nulls
      await testGt(
        nullableSchema,
        data,
        {
          cmp: null,
          expected: [0, 1, 2, 3],
        },
        options
      );
      await testGt(
        nullableSchema,
        data,
        {
          cmp: undefined,
          expected: [0, 1, 2, 3],
        },
        options
      );
    });
    it('optional', async () => {
      const data = genData([
        new Date(2021, 1, 1),
        new Date(2021, 1, 2),
        new Date(2021, 1, 3),
        new Date(2021, 1, 4),
        undefined,
      ]);
      shuffleArray(data);

      // matches on greater, undefined not gt
      await testGt(
        optionalSchema,
        data,
        {
          cmp: new Date(2021, 1, 2),
          expected: [2, 3],
        },
        options
      );
      // misses out of range, undefined not gt
      await testGt(
        optionalSchema,
        data,
        {
          cmp: new Date(2021, 1, 4),
          expected: [],
        },
        options
      );
      await testGt(
        optionalSchema,
        data,
        {
          cmp: null,
          expected: [0, 1, 2, 3],
        },
        options
      );
      await testGt(
        optionalSchema,
        data,
        {
          cmp: undefined,
          expected: [0, 1, 2, 3],
        },
        options
      );
    });
  });
  describe('>=', () => {
    it('required', async () => {
      const data = genData([
        new Date(2021, 1, 1),
        new Date(2021, 1, 2),
        new Date(2021, 1, 3),
        new Date(2021, 1, 4),
      ]);
      shuffleArray(data);

      // matches on greater or equal
      await testGte(
        requiredSchema,
        data,
        {
          cmp: new Date(2021, 1, 2),
          expected: [1, 2, 3],
        },
        options
      );
      // matches on equal at end of range
      await testGte(
        requiredSchema,
        data,
        {
          cmp: new Date(2021, 1, 4),
          expected: [3],
        },
        options
      );
      // misses if out of range
      await testGte(
        requiredSchema,
        data,
        {
          cmp: new Date(2021, 1, 5),
          expected: [],
        },
        options
      );
      await testGte(
        requiredSchema,
        data,
        {
          cmp: null,
          expected: [0, 1, 2, 3],
        },
        options
      );
      await testGte(
        requiredSchema,
        data,
        {
          cmp: undefined,
          expected: [0, 1, 2, 3],
        },
        options
      );
    });
    it('nullable', async () => {
      const data = genData([
        new Date(2021, 1, 1),
        new Date(2021, 1, 2),
        new Date(2021, 1, 3),
        new Date(2021, 1, 4),
        null,
      ]);
      shuffleArray(data);

      // matches on greater or equal, nulls not gte
      await testGte(
        nullableSchema,
        data,
        {
          cmp: new Date(2021, 1, 2),
          expected: [1, 2, 3],
        },
        options
      );
      // misses if out of range, nulls not gte
      await testGte(
        nullableSchema,
        data,
        {
          cmp: new Date(2021, 1, 5),
          expected: [],
        },
        options
      );
      // gte null includes all, including nulls
      await testGte(
        nullableSchema,
        data,
        {
          cmp: null,
          expected: [0, 1, 2, 3, 4],
        },
        options
      );
      await testGte(
        nullableSchema,
        data,
        {
          cmp: undefined,
          expected: [0, 1, 2, 3, 4],
        },
        options
      );
    });
    it('optional', async () => {
      const data = genData([
        new Date(2021, 1, 1),
        new Date(2021, 1, 2),
        new Date(2021, 1, 3),
        new Date(2021, 1, 4),
        undefined,
      ]);
      shuffleArray(data);

      // matches on greater or equal, undefined not gte
      await testGte(
        optionalSchema,
        data,
        {
          cmp: new Date(2021, 1, 2),
          expected: [1, 2, 3],
        },
        options
      );
      // out of range, undefined not gte
      await testGte(
        optionalSchema,
        data,
        {
          cmp: new Date(2021, 1, 5),
          expected: [],
        },
        options
      );
      await testGte(
        optionalSchema,
        data,
        {
          cmp: null,
          expected: [0, 1, 2, 3, 4],
        },
        options
      );
      await testGte(
        optionalSchema,
        data,
        {
          cmp: undefined,
          expected: [0, 1, 2, 3, 4],
        },
        options
      );
    });
  });
  describe('<', () => {
    it('required', async () => {
      const data = genData([
        new Date(2021, 1, 1),
        new Date(2021, 1, 2),
        new Date(2021, 1, 3),
        new Date(2021, 1, 4),
      ]);
      shuffleArray(data);

      // matches on less
      await testLt(
        requiredSchema,
        data,
        {
          cmp: new Date(2021, 1, 3),
          expected: [0, 1],
        },
        options
      );

      // misses if out of range
      await testLt(
        requiredSchema,
        data,
        {
          cmp: new Date(2021, 1, 1),
          expected: [],
        },
        options
      );

      await testLt(
        requiredSchema,
        data,
        {
          cmp: null,
          expected: [],
        },
        options
      );
      await testLt(
        requiredSchema,
        data,
        {
          cmp: undefined,
          expected: [],
        },
        options
      );
    });
    it('nullable', async () => {
      const data = genData([
        new Date(2021, 1, 1),
        new Date(2021, 1, 2),
        new Date(2021, 1, 3),
        new Date(2021, 1, 4),
        null,
      ]);
      shuffleArray(data);

      // matches on less, nulls are lt
      await testLt(
        nullableSchema,
        data,
        {
          cmp: new Date(2021, 1, 3),
          expected: [0, 1, 4],
        },
        options
      );
      // misses if out of range, nulls lt
      await testLt(
        nullableSchema,
        data,
        {
          cmp: new Date(2021, 1, 1),
          expected: [4],
        },
        options
      );
      // lt null includes none
      await testLt(
        nullableSchema,
        data,
        {
          cmp: null,
          expected: [],
        },
        options
      );
      await testLt(
        nullableSchema,
        data,
        {
          cmp: undefined,
          expected: [],
        },
        options
      );
    });
    it('optional', async () => {
      const data = genData([
        new Date(2021, 1, 1),
        new Date(2021, 1, 2),
        new Date(2021, 1, 3),
        new Date(2021, 1, 4),
        undefined,
      ]);
      shuffleArray(data);

      // matches on less, undefined not lt
      await testLt(
        optionalSchema,
        data,
        {
          cmp: new Date(2021, 1, 3),
          expected: [0, 1, 4],
        },
        options
      );
      // misses if out of range, undefined not lt
      await testLt(
        optionalSchema,
        data,
        {
          cmp: new Date(2021, 1, 1),
          expected: [4],
        },
        options
      );
      await testLt(
        optionalSchema,
        data,
        {
          cmp: null,
          expected: [],
        },
        options
      );
      await testLt(
        optionalSchema,
        data,
        {
          cmp: undefined,
          expected: [],
        },
        options
      );
    });
  });
  describe('<=', () => {
    it('required', async () => {
      const data = genData([
        new Date(2021, 1, 1),
        new Date(2021, 1, 2),
        new Date(2021, 1, 3),
        new Date(2021, 1, 4),
      ]);
      shuffleArray(data);

      // matches on less or equal
      await testLte(
        requiredSchema,
        data,
        {
          cmp: new Date(2021, 1, 3),
          expected: [0, 1, 2],
        },
        options
      );
      // matches on equal at end of range
      await testLte(
        requiredSchema,
        data,
        {
          cmp: new Date(2021, 1, 1),
          expected: [0],
        },
        options
      );
      // misses if out of range
      await testLte(
        requiredSchema,
        data,
        {
          cmp: new Date(2020, 1, 1),
          expected: [],
        },
        options
      );
      await testLte(
        requiredSchema,
        data,
        {
          cmp: null,
          expected: [],
        },
        options
      );
      await testLte(
        requiredSchema,
        data,
        {
          cmp: undefined,
          expected: [],
        },
        options
      );
    });
    it('nullable', async () => {
      const data = genData([
        new Date(2021, 1, 1),
        new Date(2021, 1, 2),
        new Date(2021, 1, 3),
        new Date(2021, 1, 4),
        null,
      ]);
      shuffleArray(data);

      // matches on less or equal, nulls are lte
      await testLte(
        nullableSchema,
        data,
        {
          cmp: new Date(2021, 1, 3),
          expected: [0, 1, 2, 4],
        },
        options
      );
      // lte null is just  nulls
      await testLte(
        nullableSchema,
        data,
        {
          cmp: null,
          expected: [4],
        },
        options
      );
      await testLte(
        nullableSchema,
        data,
        {
          cmp: undefined,
          expected: [4],
        },
        options
      );
    });
    it('optional', async () => {
      const data = genData([
        new Date(2021, 1, 1),
        new Date(2021, 1, 2),
        new Date(2021, 1, 3),
        new Date(2021, 1, 4),
        undefined,
      ]);
      shuffleArray(data);

      // matches on less or equal, undefined not lte
      await testLte(
        optionalSchema,
        data,
        {
          cmp: new Date(2021, 1, 3),
          expected: [0, 1, 2, 4],
        },
        options
      );
      // misses if out of range, undefined not lte
      await testLte(
        optionalSchema,
        data,
        {
          cmp: new Date(2020, 1, 1),
          expected: [4],
        },
        options
      );
      await testLte(
        optionalSchema,
        data,
        {
          cmp: null,
          expected: [4],
        },
        options
      );
      await testLte(
        optionalSchema,
        data,
        {
          cmp: undefined,
          expected: [4],
        },
        options
      );
    });
  });
  describe('isDefined', () => {
    it('required', async () => {
      const data = genData([new Date(2021, 1, 1)]);
      shuffleArray(data);

      // date values exist
      await testFilterOp(
        'isDefined',
        requiredSchema,
        data,
        { cmp: true, expected: [0] },
        options
      );
      await testFilterOp(
        'isDefined',
        requiredSchema,
        data,
        {
          cmp: false,
          expected: [],
        },
        options
      );
    });
    it('nullable', async () => {
      const data = genData([null]);
      shuffleArray(data);

      // null values exist
      await testFilterOp(
        'isDefined',
        nullableSchema,
        data,
        { cmp: true, expected: [] },
        options
      );
      await testFilterOp(
        'isDefined',
        nullableSchema,
        data,
        {
          cmp: false,
          expected: [0],
        },
        options
      );
    });
    it('optional', async () => {
      const data = genData([undefined]);
      shuffleArray(data);

      // undefined values dont exist
      await testFilterOp(
        'isDefined',
        optionalSchema,
        data,
        { cmp: true, expected: [] },
        options
      );
      await testFilterOp(
        'isDefined',
        optionalSchema,
        data,
        {
          cmp: false,
          expected: [0],
        },
        options
      );
    });
  });
});

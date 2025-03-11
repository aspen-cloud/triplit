import { describe, expect, it } from 'vitest';
import { Schema as S } from '../../src/schema/builder.js';
import { Type } from '../../src/schema/index.js';
import {
  genData,
  testEq,
  testFilterOp,
  testNEq,
  shuffleArray,
  testGt,
  testGte,
  testLt,
  testLte,
  TEST_OPTIONS,
} from './utils.js';

/**
 * IF THIS FAILS, ADD TESTS FOR THE MISSING OPERATIONS
 */
it('expected operations are tested', () => {
  expect(new Set(Type.supportedOperations(S.Boolean()))).toEqual(
    new Set(['=', '!=', 'isDefined', '<', '>', '<=', '>='])
  );
});

describe.each(TEST_OPTIONS)('$engine', (options) => {
  const requiredSchema = {
    collections: {
      test: {
        schema: S.Schema({
          id: S.Id(),
          attr: S.Boolean(),
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
          attr: S.Boolean({ nullable: true }),
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
          attr: S.Optional(S.Boolean()),
          _idx: S.Number(),
        }),
      },
    },
  };
  describe('=', () => {
    it('required', async () => {
      const data = genData([true, true, false, false]);
      shuffleArray(data);

      await testEq(
        requiredSchema,
        data,
        { cmp: true, expected: [0, 1] },
        options
      );
      await testEq(
        requiredSchema,
        data,
        {
          cmp: false,
          expected: [2, 3],
        },
        options
      );
      await testEq(requiredSchema, data, { cmp: null, expected: [] }, options);
      await testEq(
        requiredSchema,
        data,
        { cmp: undefined, expected: [] },
        options
      );
    });
    it('nullable', async () => {
      const data = genData([true, true, false, false, null]);
      shuffleArray(data);

      await testEq(
        nullableSchema,
        data,
        { cmp: true, expected: [0, 1] },
        options
      );
      await testEq(
        nullableSchema,
        data,
        {
          cmp: false,
          expected: [2, 3],
        },
        options
      );
      await testEq(nullableSchema, data, { cmp: null, expected: [4] }, options);
      await testEq(
        nullableSchema,
        data,
        { cmp: undefined, expected: [4] },
        options
      );
    });
    it('optional', async () => {
      const data = genData([true, true, false, false, undefined]);
      shuffleArray(data);

      await testEq(
        optionalSchema,
        data,
        { cmp: true, expected: [0, 1] },
        options
      );
      await testEq(
        optionalSchema,
        data,
        {
          cmp: false,
          expected: [2, 3],
        },
        options
      );
      await testEq(optionalSchema, data, { cmp: null, expected: [4] }, options);
      await testEq(
        optionalSchema,
        data,
        { cmp: undefined, expected: [4] },
        options
      );
    });
  });
  describe('!=', () => {
    it('required', async () => {
      const data = genData([true, true, false, false]);
      shuffleArray(data);

      await testNEq(
        requiredSchema,
        data,
        {
          cmp: true,
          expected: [2, 3],
        },
        options
      );
      await testNEq(
        requiredSchema,
        data,
        {
          cmp: false,
          expected: [0, 1],
        },
        options
      );
      await testNEq(
        requiredSchema,
        data,
        { cmp: null, expected: [0, 1, 2, 3] },
        options
      );
      await testNEq(
        requiredSchema,
        data,
        { cmp: undefined, expected: [0, 1, 2, 3] },
        options
      );
    });
    it('nullable', async () => {
      const data = genData([true, true, false, false, null]);
      shuffleArray(data);

      await testNEq(
        nullableSchema,
        data,
        {
          cmp: true,
          expected: [2, 3, 4],
        },
        options
      );
      await testNEq(
        nullableSchema,
        data,
        {
          cmp: false,
          expected: [0, 1, 4],
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
        { cmp: undefined, expected: [0, 1, 2, 3] },
        options
      );
    });
    it('optional', async () => {
      const data = genData([true, true, false, false, undefined]);
      shuffleArray(data);

      await testNEq(
        optionalSchema,
        data,
        {
          cmp: true,
          expected: [2, 3, 4],
        },
        options
      );
      await testNEq(
        optionalSchema,
        data,
        {
          cmp: false,
          expected: [0, 1, 4],
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
        { cmp: undefined, expected: [0, 1, 2, 3] },
        options
      );
    });
  });
  describe('>', () => {
    it('required', async () => {
      const data = genData([false, false, true, true]);
      shuffleArray(data);

      await testGt(
        requiredSchema,
        data,
        { cmp: false, expected: [2, 3] },
        options
      );
      await testGt(requiredSchema, data, { cmp: true, expected: [] }, options);
      await testGt(
        requiredSchema,
        data,
        { cmp: null, expected: [0, 1, 2, 3] },
        options
      );
      await testGt(
        requiredSchema,
        data,
        { cmp: undefined, expected: [0, 1, 2, 3] },
        options
      );
    });
    it('nullable', async () => {
      const data = genData([false, false, true, true, null]);
      shuffleArray(data);

      await testGt(
        nullableSchema,
        data,
        { cmp: false, expected: [2, 3] },
        options
      );
      await testGt(nullableSchema, data, { cmp: true, expected: [] }, options);
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
        { cmp: undefined, expected: [0, 1, 2, 3] },
        options
      );
    });
    it('optional', async () => {
      const data = genData([false, false, true, true, undefined]);
      shuffleArray(data);

      await testGt(
        optionalSchema,
        data,
        { cmp: false, expected: [2, 3] },
        options
      );
      await testGt(optionalSchema, data, { cmp: true, expected: [] }, options);
      await testGt(
        optionalSchema,
        data,
        { cmp: null, expected: [0, 1, 2, 3] },
        options
      );
      await testGt(
        optionalSchema,
        data,
        { cmp: undefined, expected: [0, 1, 2, 3] },
        options
      );
    });
  });
  describe('>=', () => {
    it('required', async () => {
      const data = genData([false, false, true, true]);
      shuffleArray(data);

      await testGte(
        requiredSchema,
        data,
        { cmp: false, expected: [0, 1, 2, 3] },
        options
      );
      await testGte(
        requiredSchema,
        data,
        { cmp: true, expected: [2, 3] },
        options
      );
      await testGte(
        requiredSchema,
        data,
        { cmp: null, expected: [0, 1, 2, 3] },
        options
      );
      await testGte(
        requiredSchema,
        data,
        { cmp: undefined, expected: [0, 1, 2, 3] },
        options
      );
    });
    it('nullable', async () => {
      const data = genData([false, false, true, true, null]);
      shuffleArray(data);

      await testGte(
        nullableSchema,
        data,
        { cmp: false, expected: [0, 1, 2, 3] },
        options
      );
      await testGte(
        nullableSchema,
        data,
        { cmp: true, expected: [2, 3] },
        options
      );
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
        { cmp: undefined, expected: [0, 1, 2, 3, 4] },
        options
      );
    });
    it('optional', async () => {
      const data = genData([false, false, true, true, undefined]);
      shuffleArray(data);

      await testGte(
        optionalSchema,
        data,
        { cmp: false, expected: [0, 1, 2, 3] },
        options
      );
      await testGte(
        optionalSchema,
        data,
        { cmp: true, expected: [2, 3] },
        options
      );
      await testGte(
        optionalSchema,
        data,
        { cmp: null, expected: [0, 1, 2, 3, 4] },
        options
      );
      await testGte(
        optionalSchema,
        data,
        { cmp: undefined, expected: [0, 1, 2, 3, 4] },
        options
      );
    });
  });
  describe('<', () => {
    it('required', async () => {
      const data = genData([false, false, true, true]);
      shuffleArray(data);

      await testLt(
        requiredSchema,
        data,
        { cmp: true, expected: [0, 1] },
        options
      );
      await testLt(requiredSchema, data, { cmp: false, expected: [] }, options);
      await testLt(requiredSchema, data, { cmp: null, expected: [] }, options);
      await testLt(
        requiredSchema,
        data,
        { cmp: undefined, expected: [] },
        options
      );
    });
    it('nullable', async () => {
      const data = genData([false, false, true, true, null]);
      shuffleArray(data);

      await testLt(
        nullableSchema,
        data,
        { cmp: false, expected: [4] },
        options
      );
      await testLt(
        nullableSchema,
        data,
        { cmp: true, expected: [0, 1, 4] },
        options
      );
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
        { cmp: undefined, expected: [] },
        options
      );
    });
    it('optional', async () => {
      const data = genData([false, false, true, true, undefined]);
      shuffleArray(data);

      await testLt(
        optionalSchema,
        data,
        { cmp: true, expected: [0, 1, 4] },
        options
      );
      await testLt(
        optionalSchema,
        data,
        { cmp: false, expected: [4] },
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
        { cmp: undefined, expected: [] },
        options
      );
    });
  });
  describe('<=', () => {
    it('required', async () => {
      const data = genData([false, false, true, true]);
      shuffleArray(data);

      await testLte(
        requiredSchema,
        data,
        { cmp: true, expected: [0, 1, 2, 3] },
        options
      );
      await testLte(
        requiredSchema,
        data,
        { cmp: false, expected: [0, 1] },
        options
      );
      await testLte(requiredSchema, data, { cmp: null, expected: [] }, options);
      await testLte(
        requiredSchema,
        data,
        { cmp: undefined, expected: [] },
        options
      );
    });
    it('nullable', async () => {
      const data = genData([false, false, true, true, null]);
      shuffleArray(data);

      await testLte(
        nullableSchema,
        data,
        { cmp: true, expected: [0, 1, 2, 3, 4] },
        options
      );
      await testLte(
        nullableSchema,
        data,
        { cmp: false, expected: [0, 1, 4] },
        options
      );
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
        { cmp: undefined, expected: [4] },
        options
      );
    });
    it('optional', async () => {
      const data = genData([false, false, true, true, undefined]);
      shuffleArray(data);

      await testLte(
        optionalSchema,
        data,
        { cmp: true, expected: [0, 1, 2, 3, 4] },
        options
      );
      await testLte(
        optionalSchema,
        data,
        { cmp: false, expected: [0, 1, 4] },
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
        { cmp: undefined, expected: [4] },
        options
      );
    });
  });
  describe('isDefined', () => {
    it('required', async () => {
      const data = genData([true, false]);
      shuffleArray(data);

      // boolean values exist
      await testFilterOp(
        'isDefined',
        requiredSchema,
        data,
        { cmp: true, expected: [0, 1] },
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

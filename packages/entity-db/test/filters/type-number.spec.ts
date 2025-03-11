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
  testIn,
  testLt,
  testLte,
  testNEq,
  testNIn,
  TEST_OPTIONS,
} from './utils.js';

/**
 * IF THIS FAILS, ADD TESTS FOR THE MISSING OPERATIONS
 */
it('expected operations are tested', () => {
  expect(new Set(Type.supportedOperations(S.Number()))).toEqual(
    new Set(['=', '!=', '>', '>=', '<', '<=', 'in', 'nin', 'isDefined'])
  );
});

describe.each(TEST_OPTIONS)('$engine', (options) => {
  const requiredSchema = {
    collections: {
      test: {
        schema: S.Schema({
          id: S.Id(),
          attr: S.Number(),
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
          attr: S.Number({ nullable: true }),
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
          attr: S.Optional(S.Number()),
          _idx: S.Number(),
        }),
      },
    },
  };
  describe('=', () => {
    it('required', async () => {
      const data = genData([1, 2, 2, 3, 4]);
      shuffleArray(data);

      await testEq(requiredSchema, data, { cmp: 2, expected: [1, 2] }, options);
      await testEq(requiredSchema, data, { cmp: 5, expected: [] }, options);
      await testEq(requiredSchema, data, { cmp: null, expected: [] }, options);
      await testEq(
        requiredSchema,
        data,
        { cmp: undefined, expected: [] },
        options
      );
    });
    it('nullable', async () => {
      const data = genData([1, 2, 2, 3, 4, null, null]);
      shuffleArray(data);

      await testEq(nullableSchema, data, { cmp: 2, expected: [1, 2] }, options);
      await testEq(
        nullableSchema,
        data,
        { cmp: null, expected: [5, 6] },
        options
      );
      await testEq(
        nullableSchema,
        data,
        { cmp: undefined, expected: [5, 6] },
        options
      );
    });
    it('optional', async () => {
      const data = genData([1, 2, 2, 3, 4, undefined]);
      shuffleArray(data);

      await testEq(optionalSchema, data, { cmp: 2, expected: [1, 2] }, options);
      await testEq(optionalSchema, data, { cmp: 5, expected: [] }, options);
      await testEq(optionalSchema, data, { cmp: null, expected: [5] }, options);
      await testEq(
        optionalSchema,
        data,
        { cmp: undefined, expected: [5] },
        options
      );
    });
  });
  describe('!=', () => {
    it('required', async () => {
      const data = genData([1, 2, 2, 3, 4]);
      shuffleArray(data);

      await testNEq(
        requiredSchema,
        data,
        { cmp: 2, expected: [0, 3, 4] },
        options
      );
      await testNEq(
        requiredSchema,
        data,
        { cmp: 5, expected: [0, 1, 2, 3, 4] },
        options
      );
      await testNEq(
        requiredSchema,
        data,
        { cmp: null, expected: [0, 1, 2, 3, 4] },
        options
      );
      await testNEq(
        requiredSchema,
        data,
        { cmp: undefined, expected: [0, 1, 2, 3, 4] },
        options
      );
    });
    it('nullable', async () => {
      const data = genData([1, 2, 2, 3, 4, null, null]);
      shuffleArray(data);

      await testNEq(
        nullableSchema,
        data,
        { cmp: 2, expected: [0, 3, 4, 5, 6] },
        options
      );
      await testNEq(
        nullableSchema,
        data,
        { cmp: null, expected: [0, 1, 2, 3, 4] },
        options
      );
      await testNEq(
        nullableSchema,
        data,
        { cmp: undefined, expected: [0, 1, 2, 3, 4] },
        options
      );
    });
    it('optional', async () => {
      const data = genData([1, 2, 2, 3, 4, undefined]);
      shuffleArray(data);

      await testNEq(
        optionalSchema,
        data,
        { cmp: 2, expected: [0, 3, 4, 5] },
        options
      );
      await testNEq(
        optionalSchema,
        data,
        { cmp: 5, expected: [0, 1, 2, 3, 4, 5] },
        options
      );
      await testNEq(
        optionalSchema,
        data,
        { cmp: null, expected: [0, 1, 2, 3, 4] },
        options
      );
      await testNEq(
        optionalSchema,
        data,
        { cmp: undefined, expected: [0, 1, 2, 3, 4] },
        options
      );
    });
  });
  describe('>', () => {
    it('required', async () => {
      const data = genData([1, 2, 3, 4]);
      shuffleArray(data);

      await testGt(requiredSchema, data, { cmp: 2, expected: [2, 3] }, options);
      await testGt(requiredSchema, data, { cmp: 4, expected: [] }, options);
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
      const data = genData([1, 2, 3, 4, null]);
      shuffleArray(data);

      await testGt(nullableSchema, data, { cmp: 2, expected: [2, 3] }, options);
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
      const data = genData([1, 2, 3, 4, undefined]);
      shuffleArray(data);

      await testGt(optionalSchema, data, { cmp: 2, expected: [2, 3] }, options);
      await testGt(optionalSchema, data, { cmp: 4, expected: [] }, options);
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
      const data = genData([1, 2, 3, 4]);
      shuffleArray(data);

      await testGte(
        requiredSchema,
        data,
        { cmp: 2, expected: [1, 2, 3] },
        options
      );
      await testGte(requiredSchema, data, { cmp: 5, expected: [] }, options);
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
      const data = genData([1, 2, 3, 4, null]);
      shuffleArray(data);

      await testGte(
        nullableSchema,
        data,
        { cmp: 2, expected: [1, 2, 3] },
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
      const data = genData([1, 2, 3, 4, undefined]);
      shuffleArray(data);

      await testGte(
        optionalSchema,
        data,
        { cmp: 2, expected: [1, 2, 3] },
        options
      );
      await testGte(optionalSchema, data, { cmp: 5, expected: [] }, options);
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
      const data = genData([1, 2, 3, 4]);
      shuffleArray(data);

      await testLt(requiredSchema, data, { cmp: 3, expected: [0, 1] }, options);
      await testLt(requiredSchema, data, { cmp: 1, expected: [] }, options);
      await testLt(requiredSchema, data, { cmp: null, expected: [] }, options);
      await testLt(
        requiredSchema,
        data,
        { cmp: undefined, expected: [] },
        options
      );
    });
    it('nullable', async () => {
      const data = genData([1, 2, 3, 4, null]);
      shuffleArray(data);

      await testLt(
        nullableSchema,
        data,
        { cmp: 3, expected: [0, 1, 4] },
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
      const data = genData([1, 2, 3, 4, undefined]);
      shuffleArray(data);

      await testLt(
        optionalSchema,
        data,
        { cmp: 3, expected: [0, 1, 4] },
        options
      );
      await testLt(optionalSchema, data, { cmp: 1, expected: [4] }, options);
      await testLt(optionalSchema, data, { cmp: null, expected: [] }, options);
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
      const data = genData([1, 2, 3, 4]);
      shuffleArray(data);

      await testLte(
        requiredSchema,
        data,
        { cmp: 3, expected: [0, 1, 2] },
        options
      );
      await testLte(requiredSchema, data, { cmp: 1, expected: [0] }, options);
      await testLte(requiredSchema, data, { cmp: 0, expected: [] }, options);
      await testLte(requiredSchema, data, { cmp: null, expected: [] }, options);
      await testLte(
        requiredSchema,
        data,
        { cmp: undefined, expected: [] },
        options
      );
    });
    it('nullable', async () => {
      const data = genData([1, 2, 3, 4, null]);
      shuffleArray(data);

      await testLte(
        nullableSchema,
        data,
        { cmp: 3, expected: [0, 1, 2, 4] },
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
      const data = genData([1, 2, 3, 4, undefined]);
      shuffleArray(data);

      await testLte(
        optionalSchema,
        data,
        { cmp: 3, expected: [0, 1, 2, 4] },
        options
      );
      await testLte(optionalSchema, data, { cmp: 0, expected: [4] }, options);
      await testLte(
        optionalSchema,
        data,
        { cmp: null, expected: [4] },
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
  describe('in', async () => {
    it('required', async () => {
      const data = genData([1, 2, 2, 3, 4]);
      shuffleArray(data);

      await testIn(
        requiredSchema,
        data,
        {
          cmp: [2, 4],
          expected: [1, 2, 4],
        },
        options
      );
      await testIn(
        requiredSchema,
        data,
        {
          cmp: [],
          expected: [],
        },
        options
      );
      await testIn(
        requiredSchema,
        data,
        {
          cmp: [1, 5],
          expected: [0],
        },
        options
      );
      await testIn(
        requiredSchema,
        data,
        {
          cmp: [5],
          expected: [],
        },
        options
      );
      await testIn(
        requiredSchema,
        data,
        {
          cmp: null,
          expected: [],
        },
        options
      );
      await testIn(
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
      const data = genData([1, 2, 3, 4, null]);
      shuffleArray(data);

      await testIn(
        nullableSchema,
        data,
        {
          cmp: [2, 4],
          expected: [1, 3],
        },
        options
      );
      await testIn(
        nullableSchema,
        data,
        {
          cmp: [],
          expected: [],
        },
        options
      );
      await testIn(
        nullableSchema,
        data,
        {
          cmp: [1, null],
          expected: [0],
        },
        options
      );
      await testIn(
        nullableSchema,
        data,
        {
          cmp: [1, undefined],
          expected: [0],
        },
        options
      );
      await testIn(
        nullableSchema,
        data,
        {
          cmp: null,
          expected: [],
        },
        options
      );
      await testIn(
        nullableSchema,
        data,
        {
          cmp: undefined,
          expected: [],
        },
        options
      );
    });
  });
  describe('nin', async () => {
    it('required', async () => {
      const data = genData([1, 2, 2, 3, 4]);
      shuffleArray(data);

      await testNIn(
        requiredSchema,
        data,
        {
          cmp: [2, 4],
          expected: [0, 3],
        },
        options
      );

      await testNIn(
        requiredSchema,
        data,
        {
          cmp: [],
          expected: [0, 1, 2, 3, 4],
        },
        options
      );

      await testNIn(
        requiredSchema,
        data,
        {
          cmp: [2, 5],
          expected: [0, 3, 4],
        },
        options
      );

      await testNIn(
        requiredSchema,
        data,
        {
          cmp: [1, 2, 3, 4],
          expected: [],
        },
        options
      );

      await testNIn(
        requiredSchema,
        data,
        {
          cmp: null,
          expected: [0, 1, 2, 3, 4],
        },
        options
      );

      await testNIn(
        requiredSchema,
        data,
        {
          cmp: undefined,
          expected: [0, 1, 2, 3, 4],
        },
        options
      );
    });
    it('nullable', async () => {
      const data = genData([1, 2, 3, 4, null]);
      shuffleArray(data);

      await testNIn(
        nullableSchema,
        data,
        {
          cmp: [2, 4],
          expected: [0, 2, 4],
        },
        options
      );

      await testNIn(
        nullableSchema,
        data,
        {
          cmp: [],
          expected: [0, 1, 2, 3, 4],
        },
        options
      );

      await testNIn(
        nullableSchema,
        data,
        {
          cmp: [2, null],
          expected: [0, 2, 3, 4],
        },
        options
      );

      await testNIn(
        nullableSchema,
        data,
        {
          cmp: [2, undefined],
          expected: [0, 2, 3, 4],
        },
        options
      );

      await testNIn(
        nullableSchema,
        data,
        {
          cmp: null,
          expected: [0, 1, 2, 3, 4],
        },
        options
      );

      await testNIn(
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
      const data = genData([1, 2, 3, 4, undefined]);
      shuffleArray(data);

      await testNIn(
        optionalSchema,
        data,
        {
          cmp: [2, 4],
          expected: [0, 2, 4],
        },
        options
      );

      await testNIn(
        optionalSchema,
        data,
        {
          cmp: [],
          expected: [0, 1, 2, 3, 4],
        },
        options
      );

      await testNIn(
        optionalSchema,
        data,
        {
          cmp: [1, 2, 3, 4],
          expected: [4],
        },
        options
      );

      await testNIn(
        optionalSchema,
        data,
        {
          cmp: [2, null],
          expected: [0, 2, 3, 4],
        },
        options
      );

      await testNIn(
        optionalSchema,
        data,
        {
          cmp: [2, undefined],
          expected: [0, 2, 3, 4],
        },
        options
      );

      await testNIn(
        optionalSchema,
        data,
        {
          cmp: null,
          expected: [0, 1, 2, 3, 4],
        },
        options
      );

      await testNIn(
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
  describe('isDefined', () => {
    it('required', async () => {
      const data = genData([1]);
      shuffleArray(data);

      // number values exist
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

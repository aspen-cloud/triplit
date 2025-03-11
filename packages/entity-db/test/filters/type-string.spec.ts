import { it, expect, describe } from 'vitest';
import { Schema as S } from '../../src/schema/builder.js';
import { Type } from '../../src/schema/index.js';
import {
  shuffleArray,
  genData,
  testEq,
  testFilterOp,
  testIn,
  testNEq,
  testNIn,
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
  expect(new Set(Type.supportedOperations(S.String()))).toEqual(
    new Set([
      '=',
      '!=',
      'like',
      'nlike',
      'in',
      'nin',
      'isDefined',
      '<',
      '>',
      '<=',
      '>=',
    ])
  );
});

describe.each(TEST_OPTIONS)('$engine', (options) => {
  const requiredSchema = {
    collections: {
      test: {
        schema: S.Schema({
          id: S.Id(),
          attr: S.String(),
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
          attr: S.String({ nullable: true }),
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
          attr: S.Optional(S.String()),
          _idx: S.Number(),
        }),
      },
    },
  };
  describe('=', () => {
    it('required', async () => {
      const data = genData(['a', 'b', 'b', 'c']);
      shuffleArray(data);

      // matches on equal
      await testEq(
        requiredSchema,
        data,
        { cmp: 'b', expected: [1, 2] },
        options
      );

      // misses on unequal
      await testEq(requiredSchema, data, { cmp: 'd', expected: [] }, options);
      await testEq(requiredSchema, data, { cmp: null, expected: [] }, options);
      await testEq(
        requiredSchema,
        data,
        { cmp: undefined, expected: [] },
        options
      );
    });
    it('nullable', async () => {
      const data = genData(['a', 'b', 'b', 'c', null]);
      shuffleArray(data);

      // matches on equal, no nulls
      await testEq(
        nullableSchema,
        data,
        { cmp: 'b', expected: [1, 2] },
        options
      );

      // matches on null
      await testEq(nullableSchema, data, { cmp: null, expected: [4] }, options);
      await testEq(
        nullableSchema,
        data,
        { cmp: undefined, expected: [4] },
        options
      );

      // misses on unequal, no nulls
      await testEq(nullableSchema, data, { cmp: 'd', expected: [] }, options);
    });
    it('optional', async () => {
      const data = genData(['a', 'b', 'b', 'c', undefined]);
      shuffleArray(data);

      // matches on equal, no undefined
      await testEq(
        optionalSchema,
        data,
        { cmp: 'b', expected: [1, 2] },
        options
      );

      // misses on unequal, no undefined
      await testEq(optionalSchema, data, { cmp: 'd', expected: [] }, options);

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
      const data = genData(['a', 'b', 'b', 'c']);
      shuffleArray(data);

      // matches on unequal
      await testNEq(
        requiredSchema,
        data,
        { cmp: 'b', expected: [0, 3] },
        options
      );

      // all returned if no matches
      await testNEq(
        requiredSchema,
        data,
        { cmp: 'd', expected: [0, 1, 2, 3] },
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
      const data = genData(['a', 'b', 'b', 'c', null]);
      shuffleArray(data);

      // matches on unequal, includes nulls
      await testNEq(
        nullableSchema,
        data,
        { cmp: 'b', expected: [0, 3, 4] },
        options
      );

      // can filter out null
      await testNEq(
        nullableSchema,
        data,
        { cmp: null, expected: [0, 1, 2, 3] },
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
      const data = genData(['a', 'b', 'b', 'c', undefined]);
      shuffleArray(data);

      // matches on unequal, includes undefined
      await testNEq(
        optionalSchema,
        data,
        { cmp: 'b', expected: [0, 3, 4] },
        options
      );

      await testNEq(
        optionalSchema,
        data,
        { cmp: null, expected: [0, 1, 2, 3] },
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
      const data = genData(['a', 'b', 'c', 'd']);
      shuffleArray(data);

      await testGt(
        requiredSchema,
        data,
        { cmp: 'b', expected: [2, 3] },
        options
      );
      await testGt(requiredSchema, data, { cmp: 'd', expected: [] }, options);
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
      const data = genData(['a', 'b', 'c', 'd', null]);
      shuffleArray(data);

      await testGt(
        nullableSchema,
        data,
        { cmp: 'b', expected: [2, 3] },
        options
      );
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
      const data = genData(['a', 'b', 'c', 'd', undefined]);
      shuffleArray(data);

      await testGt(
        optionalSchema,
        data,
        { cmp: 'b', expected: [2, 3] },
        options
      );
      await testGt(optionalSchema, data, { cmp: 'd', expected: [] }, options);
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
      const data = genData(['a', 'b', 'c', 'd']);
      shuffleArray(data);

      await testGte(
        requiredSchema,
        data,
        { cmp: 'b', expected: [1, 2, 3] },
        options
      );
      await testGte(requiredSchema, data, { cmp: 'e', expected: [] }, options);
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
      const data = genData(['a', 'b', 'c', 'd', null]);
      shuffleArray(data);

      await testGte(
        nullableSchema,
        data,
        { cmp: 'b', expected: [1, 2, 3] },
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
      const data = genData(['a', 'b', 'c', 'd', undefined]);
      shuffleArray(data);

      await testGte(
        optionalSchema,
        data,
        { cmp: 'b', expected: [1, 2, 3] },
        options
      );
      await testGte(optionalSchema, data, { cmp: 'e', expected: [] }, options);
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
      const data = genData(['a', 'b', 'c', 'd']);
      shuffleArray(data);

      await testLt(
        requiredSchema,
        data,
        { cmp: 'c', expected: [0, 1] },
        options
      );
      await testLt(requiredSchema, data, { cmp: 'a', expected: [] }, options);
      await testLt(requiredSchema, data, { cmp: null, expected: [] }, options);
      await testLt(
        requiredSchema,
        data,
        { cmp: undefined, expected: [] },
        options
      );
    });
    it('nullable', async () => {
      const data = genData(['a', 'b', 'c', 'd', null]);
      shuffleArray(data);

      await testLt(
        nullableSchema,
        data,
        { cmp: 'c', expected: [0, 1, 4] },
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
      const data = genData(['a', 'b', 'c', 'd', undefined]);
      shuffleArray(data);

      await testLt(
        optionalSchema,
        data,
        { cmp: 'c', expected: [0, 1, 4] },
        options
      );
      await testLt(optionalSchema, data, { cmp: 'a', expected: [4] }, options);
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
      const data = genData(['a', 'b', 'c', 'd']);
      shuffleArray(data);

      await testLte(
        requiredSchema,
        data,
        { cmp: 'c', expected: [0, 1, 2] },
        options
      );
      await testLte(requiredSchema, data, { cmp: 'a', expected: [0] }, options);
      await testLte(requiredSchema, data, { cmp: '', expected: [] }, options);
      await testLte(requiredSchema, data, { cmp: null, expected: [] }, options);
      await testLte(
        requiredSchema,
        data,
        { cmp: undefined, expected: [] },
        options
      );
    });
    it('nullable', async () => {
      const data = genData(['a', 'b', 'c', 'd', null]);
      shuffleArray(data);

      await testLte(
        nullableSchema,
        data,
        { cmp: 'c', expected: [0, 1, 2, 4] },
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
      const data = genData(['a', 'b', 'c', 'd', undefined]);
      shuffleArray(data);

      await testLte(
        optionalSchema,
        data,
        { cmp: 'c', expected: [0, 1, 2, 4] },
        options
      );
      await testLte(optionalSchema, data, { cmp: '', expected: [4] }, options);
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
  // TODO: move over like / nlike tests from db.spec.ts
  describe.todo('like');
  describe.todo('nlike');
  describe('in', () => {
    it('required', async () => {
      const data = genData(['a', 'b', 'b', 'c', 'd']);
      shuffleArray(data);

      // matches on values in arr
      await testIn(
        requiredSchema,
        data,
        { cmp: ['b', 'd'], expected: [1, 2, 4] },
        options
      );
      // empty arr matches nothing
      await testIn(requiredSchema, data, { cmp: [], expected: [] }, options);
      // supports partial match
      await testIn(
        requiredSchema,
        data,
        { cmp: ['b', 'e'], expected: [1, 2] },
        options
      );
      // no matches returns empty
      await testIn(requiredSchema, data, { cmp: ['e'], expected: [] }, options);

      await testIn(requiredSchema, data, { cmp: null, expected: [] }, options);
      await testIn(
        requiredSchema,
        data,
        { cmp: undefined, expected: [] },
        options
      );
    });
    it('nullable', async () => {
      const data = genData(['a', 'b', 'c', 'd', null]);
      shuffleArray(data);

      // matches on values in arr, null not included
      await testIn(
        nullableSchema,
        data,
        { cmp: ['b', 'd'], expected: [1, 3] },
        options
      );
      // empty arr matches nothing, no null
      await testIn(nullableSchema, data, { cmp: [], expected: [] }, options);
      // can match on null
      await testIn(
        nullableSchema,
        data,
        { cmp: ['b', null], expected: [1] },
        options
      );
      await testIn(
        nullableSchema,
        data,
        { cmp: ['b', undefined], expected: [1] },
        options
      );
      await testIn(nullableSchema, data, { cmp: null, expected: [] }, options);
      await testIn(
        nullableSchema,
        data,
        { cmp: undefined, expected: [] },
        options
      );
    });
    it('optional', async () => {
      const data = genData(['a', 'b', 'c', 'd', undefined]);
      shuffleArray(data);

      // matches on values in arr, undefined not included
      await testIn(
        optionalSchema,
        data,
        { cmp: ['b', 'd'], expected: [1, 3] },
        options
      );
      // empty arr matches nothing, no undefined
      await testIn(optionalSchema, data, { cmp: [], expected: [] }, options);
      await testIn(
        optionalSchema,
        data,
        { cmp: ['b', null], expected: [1] },
        options
      );
      await testIn(
        optionalSchema,
        data,
        { cmp: ['b', undefined], expected: [1] },
        options
      );
      await testIn(optionalSchema, data, { cmp: null, expected: [] }, options);
      await testIn(
        optionalSchema,
        data,
        { cmp: undefined, expected: [] },
        options
      );
    });
  });
  describe('nin', () => {
    it('required', async () => {
      const data = genData(['a', 'b', 'b', 'c', 'd']);
      shuffleArray(data);

      // matches on values not in arr
      await testNIn(
        requiredSchema,
        data,
        { cmp: ['b', 'd'], expected: [0, 3] },
        options
      );

      // empty arr matches everything
      await testNIn(
        requiredSchema,
        data,
        { cmp: [], expected: [0, 1, 2, 3, 4] },
        options
      );

      // supports partial match
      await testNIn(
        requiredSchema,
        data,
        { cmp: ['b', 'e'], expected: [0, 3, 4] },
        options
      );

      // all values returns empty
      await testNIn(
        requiredSchema,
        data,
        { cmp: ['a', 'b', 'c', 'd'], expected: [] },
        options
      );

      await testNIn(
        requiredSchema,
        data,
        { cmp: null, expected: [0, 1, 2, 3, 4] },
        options
      );
      await testNIn(
        requiredSchema,
        data,
        { cmp: undefined, expected: [0, 1, 2, 3, 4] },
        options
      );
    });
    it('nullable', async () => {
      const data = genData(['a', 'b', 'c', 'd', null]);
      shuffleArray(data);

      // matches on values not in arr, null included
      await testNIn(
        nullableSchema,
        data,
        { cmp: ['b', 'd'], expected: [0, 2, 4] },
        options
      );

      // empty arr matches everything, null included
      await testNIn(
        nullableSchema,
        data,
        { cmp: [], expected: [0, 1, 2, 3, 4] },
        options
      );

      // can filter out null
      await testNIn(
        nullableSchema,
        data,
        { cmp: ['b', null], expected: [0, 2, 3, 4] },
        options
      );
      await testNIn(
        nullableSchema,
        data,
        { cmp: ['b', undefined], expected: [0, 2, 3, 4] },
        options
      );
      await testNIn(
        nullableSchema,
        data,
        { cmp: null, expected: [0, 1, 2, 3, 4] },
        options
      );
      await testNIn(
        nullableSchema,
        data,
        { cmp: undefined, expected: [0, 1, 2, 3, 4] },
        options
      );
    });
    it('optional', async () => {
      const data = genData(['a', 'b', 'c', 'd', undefined]);
      shuffleArray(data);

      // matches on values not in arr, undefined included
      await testNIn(
        optionalSchema,
        data,
        { cmp: ['b', 'd'], expected: [0, 2, 4] },
        options
      );

      // empty arr matches everything, undefined included
      await testNIn(
        optionalSchema,
        data,
        { cmp: [], expected: [0, 1, 2, 3, 4] },
        options
      );

      await testNIn(
        optionalSchema,
        data,
        { cmp: ['b', null], expected: [0, 2, 3, 4] },
        options
      );
      await testNIn(
        optionalSchema,
        data,
        { cmp: ['b', undefined], expected: [0, 2, 3, 4] },
        options
      );
      await testNIn(
        optionalSchema,
        data,
        { cmp: null, expected: [0, 1, 2, 3, 4] },
        options
      );
      await testNIn(
        optionalSchema,
        data,
        { cmp: undefined, expected: [0, 1, 2, 3, 4] },
        options
      );
    });
  });
  describe('isDefined', () => {
    it('required', async () => {
      const data = genData(['a']);
      shuffleArray(data);

      // string values exist
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

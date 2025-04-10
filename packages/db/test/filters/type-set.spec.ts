import { it, expect, describe } from 'vitest';
import { Schema as S } from '../../src/schema/builder.js';
import { Type } from '../../src/schema/index.js';
import { genData, testFilterOp, shuffleArray, TEST_OPTIONS } from './utils.js';

/**
 * IF THIS FAILS, ADD TESTS FOR THE MISSING OPERATIONS
 */
it('expected operations are tested', () => {
  expect(new Set(Type.supportedOperations(S.Set(S.String())))).toEqual(
    // Set operations + item type operations
    // Below we just test '=' as a proxy for the other type operations
    new Set([
      'SET_=',
      'SET_!=',
      'SET_like',
      'SET_nlike',
      'SET_in',
      'SET_nin',
      'SET_has',
      'SET_!has',
      'SET_isDefined',
      'SET_<',
      'SET_>',
      'SET_<=',
      'SET_>=',
    ])
  );
});

describe.each(TEST_OPTIONS)('$engine', (options) => {
  const requiredSchema = {
    collections: {
      test: {
        schema: S.Schema({
          id: S.Id(),
          attr: S.Set(S.String()),
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
          attr: S.Set(S.String(), { nullable: true }),
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
          attr: S.Optional(S.Set(S.String())),
          _idx: S.Number(),
        }),
      },
    },
  };
  describe.each([{ op: '=' }, { op: 'has' }])('$op', ({ op }) => {
    it('required', async () => {
      const data = genData([
        new Set(['a', 'b']),
        new Set(['b', 'c']),
        new Set(['c', 'd']),
      ]);
      shuffleArray(data);

      // matches on sets that contain the value
      await testFilterOp(
        op,
        requiredSchema,
        data,
        { cmp: 'b', expected: [0, 1] },
        options
      );

      // misses if no sets contain value
      await testFilterOp(
        op,
        requiredSchema,
        data,
        { cmp: 'e', expected: [] },
        options
      );

      await testFilterOp(
        op,
        requiredSchema,
        data,
        { cmp: null, expected: [] },
        options
      );

      await testFilterOp(
        op,
        requiredSchema,
        data,
        { cmp: undefined, expected: [] },
        options
      );
    });
    it('nullable', async () => {
      const data = genData([new Set(['a', 'b']), null, new Set(['c', 'd'])]);
      shuffleArray(data);

      // matches on sets that contain the value, no null
      await testFilterOp(
        op,
        nullableSchema,
        data,
        { cmp: 'b', expected: [0] },
        options
      );

      // misses if no sets contain value, no null
      await testFilterOp(
        op,
        nullableSchema,
        data,
        { cmp: 'e', expected: [] },
        options
      );

      await testFilterOp(
        op,
        nullableSchema,
        data,
        { cmp: null, expected: [] },
        options
      );

      await testFilterOp(
        op,
        nullableSchema,
        data,
        { cmp: undefined, expected: [] },
        options
      );
    });
    it('optional', async () => {
      const data = genData([
        new Set(['a', 'b']),
        new Set(['b', 'c']),
        new Set(['c', 'd']),
        undefined,
      ]);
      shuffleArray(data);

      // matches on sets that contain the value, no undefined
      await testFilterOp(
        op,
        optionalSchema,
        data,
        { cmp: 'b', expected: [0, 1] },
        options
      );

      // misses if no sets contain value, no undefined
      await testFilterOp(
        op,
        optionalSchema,
        data,
        { cmp: 'e', expected: [] },
        options
      );
      await testFilterOp(
        op,
        optionalSchema,
        data,
        { cmp: null, expected: [] },
        options
      );
      await testFilterOp(
        op,
        optionalSchema,
        data,
        { cmp: undefined, expected: [] },
        options
      );
    });
  });
  // An odd on we should figure out, technically we shoudl test for every possible operator
  // The expected behavior is to pass through to all values of the set
  describe.todo('!=');
  describe('!has', () => {
    it('required', async () => {
      const data = genData([
        new Set(['a', 'b']),
        new Set(['b', 'c']),
        new Set(['c', 'd']),
      ]);
      shuffleArray(data);

      // matches on sets that do not contain the value
      await testFilterOp(
        '!has',
        requiredSchema,
        data,
        { cmp: 'b', expected: [2] },
        options
      );

      // all returned if no matches
      await testFilterOp(
        '!has',
        requiredSchema,
        data,
        { cmp: 'e', expected: [0, 1, 2] },
        options
      );

      await testFilterOp(
        '!has',
        requiredSchema,
        data,
        { cmp: null, expected: [0, 1, 2] },
        options
      );

      await testFilterOp(
        '!has',
        requiredSchema,
        data,
        { cmp: undefined, expected: [0, 1, 2] },
        options
      );
    });
    it('nullable', async () => {
      const data = genData([new Set(['a', 'b']), null, new Set(['c', 'd'])]);
      shuffleArray(data);

      // matches on sets that do not contain the value, including null
      await testFilterOp(
        '!has',
        nullableSchema,
        data,
        { cmp: 'b', expected: [1, 2] },
        options
      );

      // all returned if no matches, including null
      await testFilterOp(
        '!has',
        nullableSchema,
        data,
        { cmp: 'e', expected: [0, 1, 2] },
        options
      );

      await testFilterOp(
        '!has',
        nullableSchema,
        data,
        { cmp: null, expected: [0, 1, 2] },
        options
      );

      await testFilterOp(
        '!has',
        nullableSchema,
        data,
        { cmp: undefined, expected: [0, 1, 2] },
        options
      );
    });
    it('optional', async () => {
      const data = genData([
        new Set(['a', 'b']),
        new Set(['b', 'c']),
        new Set(['c', 'd']),
        undefined,
      ]);
      shuffleArray(data);

      // matches on sets that do not contain the value, including undefined
      await testFilterOp(
        '!has',
        optionalSchema,
        data,
        { cmp: 'b', expected: [2, 3] },
        options
      );

      // all returned if no matches, including undefined
      await testFilterOp(
        '!has',
        optionalSchema,
        data,
        { cmp: 'e', expected: [0, 1, 2, 3] },
        options
      );

      await testFilterOp(
        '!has',
        optionalSchema,
        data,
        { cmp: null, expected: [0, 1, 2, 3] },
        options
      );

      await testFilterOp(
        '!has',
        optionalSchema,
        data,
        { cmp: undefined, expected: [0, 1, 2, 3] },
        options
      );
    });
  });
  describe('isDefined', () => {
    it('required', async () => {
      const data = genData([new Set(['a', 'b'])]);
      shuffleArray(data);

      // set values exist
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

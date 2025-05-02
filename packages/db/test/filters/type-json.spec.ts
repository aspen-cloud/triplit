import { it, expect, describe } from 'vitest';
import { Schema as S } from '../../src/schema/builder.js';
import { Type } from '../../src/schema/index.js';
import { genData, shuffleArray, TEST_OPTIONS, testFilterOp } from './utils.js';

/**
 * IF THIS FAILS, ADD TESTS FOR THE MISSING OPERATIONS
 */
it('expected operations are tested', () => {
  expect(new Set(Type.supportedOperations(S.Json()))).toEqual(
    // Set operations + item type operations
    // Below we just test '=' as a proxy for the other type operations
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
      'has',
      '!has',
    ])
  );
});

describe.each(TEST_OPTIONS)('$engine', (options) => {
  const requiredSchema = {
    collections: {
      test: {
        schema: S.Schema({
          id: S.Id(),
          attr: S.Json(),
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
          attr: S.Json({ nullable: true }),
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
          attr: S.Optional(S.Json()),
          _idx: S.Number(),
        }),
      },
    },
  };
  describe('isDefined', () => {
    it('required', async () => {
      const data = genData([
        {
          a: '1',
        },
      ]);
      shuffleArray(data);

      // values exist
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

  // Tests sub operations of nested data
  describe('object paths', () => {
    it('=', async () => {
      const data = genData([{ a: 1 }, { a: '2' }, { a: 3 }]);
      shuffleArray(data);

      await testFilterOp(
        ['attr.a', '='],
        requiredSchema,
        data,
        { cmp: 1, expected: [0] },
        options
      );

      await testFilterOp(
        ['attr.a', '='],
        requiredSchema,
        data,
        { cmp: '2', expected: [1] },
        options
      );

      await testFilterOp(
        ['attr.a', '='],
        requiredSchema,
        data,
        { cmp: '3', expected: [] },
        options
      );

      await testFilterOp(
        ['attr.a', '='],
        requiredSchema,
        data,
        { cmp: null, expected: [] },
        options
      );

      await testFilterOp(
        ['attr.a', '='],
        requiredSchema,
        data,
        { cmp: undefined, expected: [] },
        options
      );
    });
    it('<', async () => {
      const data = genData([{ a: 1 }, { a: '2' }, { a: 3 }]);
      shuffleArray(data);

      await testFilterOp(
        ['attr.a', '<'],
        requiredSchema,
        data,
        { cmp: 1, expected: [] },
        options
      );

      await testFilterOp(
        ['attr.a', '<'],
        requiredSchema,
        data,
        { cmp: 2, expected: [0] },
        options
      );

      await testFilterOp(
        ['attr.a', '<'],
        requiredSchema,
        data,
        { cmp: 3, expected: [0] },
        options
      );

      await testFilterOp(
        ['attr.a', '<'],
        requiredSchema,
        data,
        { cmp: 4, expected: [0, 2] },
        options
      );

      await testFilterOp(
        ['attr.a', '<'],
        requiredSchema,
        data,
        { cmp: null, expected: [] },
        options
      );

      await testFilterOp(
        ['attr.a', '<'],
        requiredSchema,
        data,
        { cmp: undefined, expected: [] },
        options
      );
    });
    it('>', async () => {
      const data = genData([{ a: 1 }, { a: '2' }, { a: 3 }]);
      shuffleArray(data);

      await testFilterOp(
        ['attr.a', '>'],
        requiredSchema,
        data,
        { cmp: 0, expected: [0, 1, 2] },
        options
      );

      await testFilterOp(
        ['attr.a', '>'],
        requiredSchema,
        data,
        { cmp: 1, expected: [1, 2] },
        options
      );

      await testFilterOp(
        ['attr.a', '>'],
        requiredSchema,
        data,
        { cmp: 2, expected: [1, 2] },
        options
      );

      await testFilterOp(
        ['attr.a', '>'],
        requiredSchema,
        data,
        { cmp: 3, expected: [1] },
        options
      );

      // null is considered comparable and less than anything
      await testFilterOp(
        ['attr.a', '>'],
        requiredSchema,
        data,
        { cmp: null, expected: [0, 1, 2] },
        options
      );

      await testFilterOp(
        ['attr.a', '>'],
        requiredSchema,
        data,
        { cmp: undefined, expected: [0, 1, 2] },
        options
      );
    });
  });

  // Tests sub operations of data in arrays
  describe('array paths', () => {
    it('=', async () => {
      const data = genData([
        ['test', 1, 'test'],
        ['test', '2', 'test'],
        ['test', 3, 'test'],
      ]);
      shuffleArray(data);

      await testFilterOp(
        ['attr.1', '='],
        requiredSchema,
        data,
        { cmp: 1, expected: [0] },
        options
      );
      await testFilterOp(
        ['attr.1', '='],
        requiredSchema,
        data,
        { cmp: '2', expected: [1] },
        options
      );
      await testFilterOp(
        ['attr.1', '='],
        requiredSchema,
        data,
        { cmp: '3', expected: [] },
        options
      );
      await testFilterOp(
        ['attr.1', '='],
        requiredSchema,
        data,
        { cmp: null, expected: [] },
        options
      );
      await testFilterOp(
        ['attr.1', '='],
        requiredSchema,
        data,
        { cmp: undefined, expected: [] },
        options
      );
    });
    it('<', async () => {
      const data = genData([
        ['test', 1, 'test'],
        ['test', '2', 'test'],
        ['test', 3, 'test'],
      ]);
      shuffleArray(data);

      await testFilterOp(
        ['attr.1', '<'],
        requiredSchema,
        data,
        { cmp: 1, expected: [] },
        options
      );
      await testFilterOp(
        ['attr.1', '<'],
        requiredSchema,
        data,
        { cmp: 2, expected: [0] },
        options
      );
      await testFilterOp(
        ['attr.1', '<'],
        requiredSchema,
        data,
        { cmp: 3, expected: [0] },
        options
      );
      await testFilterOp(
        ['attr.1', '<'],
        requiredSchema,
        data,
        { cmp: 4, expected: [0, 2] },
        options
      );
      await testFilterOp(
        ['attr.1', '<'],
        requiredSchema,
        data,
        { cmp: null, expected: [] },
        options
      );
      await testFilterOp(
        ['attr.1', '<'],
        requiredSchema,
        data,
        { cmp: undefined, expected: [] },
        options
      );
    });
    it('>', async () => {
      const data = genData([
        ['test', 1, 'test'],
        ['test', '2', 'test'],
        ['test', 3, 'test'],
      ]);
      shuffleArray(data);

      await testFilterOp(
        ['attr.1', '>'],
        requiredSchema,
        data,
        { cmp: 0, expected: [0, 1, 2] },
        options
      );
      await testFilterOp(
        ['attr.1', '>'],
        requiredSchema,
        data,
        { cmp: 1, expected: [1, 2] },
        options
      );
      await testFilterOp(
        ['attr.1', '>'],
        requiredSchema,
        data,
        { cmp: 2, expected: [1, 2] },
        options
      );
      await testFilterOp(
        ['attr.1', '>'],
        requiredSchema,
        data,
        { cmp: 3, expected: [1] },
        options
      );
      await testFilterOp(
        ['attr.1', '>'],
        requiredSchema,
        data,
        { cmp: null, expected: [0, 1, 2] },
        options
      );
      await testFilterOp(
        ['attr.1', '>'],
        requiredSchema,
        data,
        { cmp: undefined, expected: [0, 1, 2] },
        options
      );
    });
  });
});

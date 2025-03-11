import { it, expect, describe } from 'vitest';
import { Schema as S } from '../../src/schema/builder.js';
import { Type } from '../../src/schema/index.js';
import { genData, shuffleArray, TEST_OPTIONS, testFilterOp } from './utils.js';

/**
 * IF THIS FAILS, ADD TESTS FOR THE MISSING OPERATIONS
 */
it('expected operations are tested', () => {
  expect(new Set(Type.supportedOperations(S.Record({})))).toEqual(
    new Set(['isDefined'])
  );
});

describe.each(TEST_OPTIONS)('$engine', (options) => {
  const requiredSchema = {
    collections: {
      test: {
        schema: S.Schema({
          id: S.Id(),
          attr: S.Record({
            a: S.String(),
          }),
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
          attr: S.Record(
            {
              a: S.String(),
            },
            { nullable: true }
          ),
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
          attr: S.Optional(
            S.Record({
              a: S.String(),
            })
          ),
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
});

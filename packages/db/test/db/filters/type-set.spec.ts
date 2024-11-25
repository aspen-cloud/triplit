import { it, expect, describe } from 'vitest';
import { Schema as S } from '../../../src/schema/builder.js';
import { shuffleArray } from '../../utils/data.js';
import { genData, testFilterOp } from './utils.js';

// If this fails, add tests for the missing operations
it('expected operations are tested', () => {
  expect(new Set(S.Set(S.String()).supportedOperations)).toEqual(
    new Set(['=', '!=', 'has', '!has', 'isDefined'])
  );
});

describe.each([{ skipIndex: false }, { skipIndex: true }])(
  'skipIndex: $skipIndex',
  ({ skipIndex }) => {
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
          { skipIndex }
        );

        // misses if no sets contain value
        await testFilterOp(
          op,
          requiredSchema,
          data,
          { cmp: 'e', expected: [] },
          { skipIndex }
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
          { skipIndex }
        );

        // misses if no sets contain value, no null
        await testFilterOp(
          op,
          nullableSchema,
          data,
          { cmp: 'e', expected: [] },
          { skipIndex }
        );

        // No way to filter for null sets
        // This feels wrong, should probably re-eval the equality operator now that has exists
        // Should scrub docs for use of '=' and replace with 'has' where appropriate
        // Or add operator 'is' or something
        await testFilterOp(
          op,
          nullableSchema,
          data,
          { cmp: null, expected: [] },
          { skipIndex }
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
          { skipIndex }
        );

        // misses if no sets contain value, no undefined
        await testFilterOp(
          op,
          optionalSchema,
          data,
          { cmp: 'e', expected: [] },
          { skipIndex }
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
          { skipIndex }
        );

        // all returned if no matches
        await testFilterOp(
          '!has',
          requiredSchema,
          data,
          { cmp: 'e', expected: [0, 1, 2] },
          { skipIndex }
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
          { skipIndex }
        );

        // all returned if no matches, including null
        await testFilterOp(
          '!has',
          nullableSchema,
          data,
          { cmp: 'e', expected: [0, 1, 2] },
          { skipIndex }
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
          { skipIndex }
        );

        // all returned if no matches, including undefined
        await testFilterOp(
          '!has',
          optionalSchema,
          data,
          { cmp: 'e', expected: [0, 1, 2, 3] },
          { skipIndex }
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
          { skipIndex }
        );
        await testFilterOp(
          'isDefined',
          requiredSchema,
          data,
          {
            cmp: false,
            expected: [],
          },
          { skipIndex }
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
          { cmp: true, expected: [0] },
          { skipIndex }
        );
        await testFilterOp(
          'isDefined',
          nullableSchema,
          data,
          {
            cmp: false,
            expected: [],
          },
          { skipIndex }
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
          { skipIndex }
        );
        await testFilterOp(
          'isDefined',
          optionalSchema,
          data,
          {
            cmp: false,
            expected: [0],
          },
          { skipIndex }
        );
      });
    });
  }
);

import { describe, expect, it } from 'vitest';
import { Schema as S } from '../../../src/schema/builder.js';
import {
  genData,
  shuffleArray,
  testEq,
  testFilterOp,
  testNEq,
} from './utils.js';

// If this fails, add tests for the missing operations
it('expected operations are tested', () => {
  expect(new Set(S.Boolean().supportedOperations)).toEqual(
    new Set(['=', '!=', 'exists'])
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
          { skipIndex }
        );
        await testEq(
          requiredSchema,
          data,
          {
            cmp: false,
            expected: [2, 3],
          },
          { skipIndex }
        );
      });
      it('nullable', async () => {
        const data = genData([true, true, false, false, null]);
        shuffleArray(data);

        await testEq(
          nullableSchema,
          data,
          { cmp: true, expected: [0, 1] },
          { skipIndex }
        );
        await testEq(
          nullableSchema,
          data,
          {
            cmp: false,
            expected: [2, 3],
          },
          { skipIndex }
        );
        await testEq(
          nullableSchema,
          data,
          { cmp: null, expected: [4] },
          { skipIndex }
        );
      });
      it('optional', async () => {
        const data = genData([true, true, false, false, undefined]);
        shuffleArray(data);

        await testEq(
          optionalSchema,
          data,
          { cmp: true, expected: [0, 1] },
          { skipIndex }
        );
        await testEq(
          optionalSchema,
          data,
          {
            cmp: false,
            expected: [2, 3],
          },
          { skipIndex }
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
          { skipIndex }
        );
        await testNEq(
          requiredSchema,
          data,
          {
            cmp: false,
            expected: [0, 1],
          },
          { skipIndex }
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
          { skipIndex }
        );
        await testNEq(
          nullableSchema,
          data,
          {
            cmp: false,
            expected: [0, 1, 4],
          },
          { skipIndex }
        );
        await testNEq(
          nullableSchema,
          data,
          {
            cmp: null,
            expected: [0, 1, 2, 3],
          },
          { skipIndex }
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
          { skipIndex }
        );
        await testNEq(
          optionalSchema,
          data,
          {
            cmp: false,
            expected: [0, 1, 4],
          },
          { skipIndex }
        );
      });
    });
    describe('exists', () => {
      it('required', async () => {
        const data = genData([true, false]);
        shuffleArray(data);

        // boolean values exist
        await testFilterOp(
          'exists',
          requiredSchema,
          data,
          { cmp: true, expected: [0, 1] },
          { skipIndex }
        );
        await testFilterOp(
          'exists',
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
          'exists',
          nullableSchema,
          data,
          { cmp: true, expected: [0] },
          { skipIndex }
        );
        await testFilterOp(
          'exists',
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
          'exists',
          optionalSchema,
          data,
          { cmp: true, expected: [] },
          { skipIndex }
        );
        await testFilterOp(
          'exists',
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

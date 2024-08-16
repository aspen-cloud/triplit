import { describe, expect, it, test } from 'vitest';
import { Schema as S } from '../../../src/schema/builder.js';
import {
  genData,
  shuffleArray,
  testEq,
  testFilterOp,
  testGt,
  testGte,
  testIn,
  testLt,
  testLte,
  testNEq,
  testNIn,
} from './utils.js';

// If this fails, add tests for the missing operations
it('expected operations are tested', () => {
  expect(new Set(S.Number().supportedOperations)).toEqual(
    new Set(['=', '!=', '>', '>=', '<', '<=', 'in', 'nin', 'isDefined'])
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

        await testEq(
          requiredSchema,
          data,
          { cmp: 2, expected: [1, 2] },
          { skipIndex }
        );
        await testEq(
          requiredSchema,
          data,
          { cmp: 5, expected: [] },
          { skipIndex }
        );
      });
      it('nullable', async () => {
        const data = genData([1, 2, 2, 3, 4, null, null]);
        shuffleArray(data);

        await testEq(
          nullableSchema,
          data,
          { cmp: 2, expected: [1, 2] },
          { skipIndex }
        );
        await testEq(
          nullableSchema,
          data,
          { cmp: null, expected: [5, 6] },
          { skipIndex }
        );
      });
      it('optional', async () => {
        const data = genData([1, 2, 2, 3, 4, undefined]);
        shuffleArray(data);

        await testEq(
          optionalSchema,
          data,
          { cmp: 2, expected: [1, 2] },
          { skipIndex }
        );
        await testEq(
          optionalSchema,
          data,
          { cmp: 5, expected: [] },
          { skipIndex }
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
          { skipIndex }
        );
        await testNEq(
          requiredSchema,
          data,
          { cmp: 5, expected: [0, 1, 2, 3, 4] },
          { skipIndex }
        );
      });
      it('nullable', async () => {
        const data = genData([1, 2, 2, 3, 4, null, null]);
        shuffleArray(data);

        await testNEq(
          nullableSchema,
          data,
          { cmp: 2, expected: [0, 3, 4, 5, 6] },
          { skipIndex }
        );
        await testNEq(
          nullableSchema,
          data,
          { cmp: null, expected: [0, 1, 2, 3, 4] },
          { skipIndex }
        );
      });
      it('optional', async () => {
        const data = genData([1, 2, 2, 3, 4, undefined]);
        shuffleArray(data);

        await testNEq(
          optionalSchema,
          data,
          { cmp: 2, expected: [0, 3, 4, 5] },
          { skipIndex }
        );
        await testNEq(
          optionalSchema,
          data,
          { cmp: 5, expected: [0, 1, 2, 3, 4, 5] },
          { skipIndex }
        );
      });
    });
    describe('>', () => {
      it('required', async () => {
        const data = genData([1, 2, 3, 4]);
        shuffleArray(data);

        await testGt(
          requiredSchema,
          data,
          { cmp: 2, expected: [2, 3] },
          { skipIndex }
        );
        await testGt(
          requiredSchema,
          data,
          { cmp: 4, expected: [] },
          { skipIndex }
        );
      });
      it('nullable', async () => {
        const data = genData([1, 2, 3, 4, null]);
        shuffleArray(data);

        await testGt(
          nullableSchema,
          data,
          { cmp: 2, expected: [2, 3] },
          { skipIndex }
        );
        await testGt(
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
        const data = genData([1, 2, 3, 4, undefined]);
        shuffleArray(data);

        await testGt(
          optionalSchema,
          data,
          { cmp: 2, expected: [2, 3] },
          { skipIndex }
        );
        await testGt(
          optionalSchema,
          data,
          { cmp: 4, expected: [] },
          { skipIndex }
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
          { skipIndex }
        );
        await testGte(
          requiredSchema,
          data,
          { cmp: 5, expected: [] },
          { skipIndex }
        );
      });
      it('nullable', async () => {
        const data = genData([1, 2, 3, 4, null]);
        shuffleArray(data);

        await testGte(
          nullableSchema,
          data,
          { cmp: 2, expected: [1, 2, 3] },
          { skipIndex }
        );
        await testGte(
          nullableSchema,
          data,
          {
            cmp: null,
            expected: [0, 1, 2, 3, 4],
          },
          { skipIndex }
        );
      });
      it('optional', async () => {
        const data = genData([1, 2, 3, 4, undefined]);
        shuffleArray(data);

        await testGte(
          optionalSchema,
          data,
          { cmp: 2, expected: [1, 2, 3] },
          { skipIndex }
        );
        await testGte(
          optionalSchema,
          data,
          { cmp: 5, expected: [] },
          { skipIndex }
        );
      });
    });
    describe('<', () => {
      it('required', async () => {
        const data = genData([1, 2, 3, 4]);
        shuffleArray(data);

        await testLt(
          requiredSchema,
          data,
          { cmp: 3, expected: [0, 1] },
          { skipIndex }
        );
        await testLt(
          requiredSchema,
          data,
          { cmp: 1, expected: [] },
          { skipIndex }
        );
      });
      it('nullable', async () => {
        const data = genData([1, 2, 3, 4, null]);
        shuffleArray(data);

        await testLt(
          nullableSchema,
          data,
          { cmp: 3, expected: [0, 1, 4] },
          { skipIndex }
        );
        await testLt(
          nullableSchema,
          data,
          {
            cmp: null,
            expected: [],
          },
          { skipIndex }
        );
      });
      it('optional', async () => {
        const data = genData([1, 2, 3, 4, undefined]);
        shuffleArray(data);

        await testLt(
          optionalSchema,
          data,
          { cmp: 3, expected: [0, 1] },
          { skipIndex }
        );
        await testLt(
          optionalSchema,
          data,
          { cmp: 1, expected: [] },
          { skipIndex }
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
          { skipIndex }
        );
        await testLte(
          requiredSchema,
          data,
          { cmp: 1, expected: [0] },
          { skipIndex }
        );
        await testLte(
          requiredSchema,
          data,
          { cmp: 0, expected: [] },
          { skipIndex }
        );
      });
      it('nullable', async () => {
        const data = genData([1, 2, 3, 4, null]);
        shuffleArray(data);

        await testLte(
          nullableSchema,
          data,
          { cmp: 3, expected: [0, 1, 2, 4] },
          { skipIndex }
        );
        await testLte(
          nullableSchema,
          data,
          {
            cmp: null,
            expected: [4],
          },
          { skipIndex }
        );
      });
      it('optional', async () => {
        const data = genData([1, 2, 3, 4, undefined]);
        shuffleArray(data);

        await testLte(
          optionalSchema,
          data,
          { cmp: 3, expected: [0, 1, 2] },
          { skipIndex }
        );
        await testLte(
          optionalSchema,
          data,
          { cmp: 0, expected: [] },
          { skipIndex }
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
          { skipIndex }
        );
        await testIn(
          requiredSchema,
          data,
          {
            cmp: [],
            expected: [],
          },
          { skipIndex }
        );
        await testIn(
          requiredSchema,
          data,
          {
            cmp: [1, 5],
            expected: [0],
          },
          { skipIndex }
        );
        await testIn(
          requiredSchema,
          data,
          {
            cmp: [5],
            expected: [],
          },
          { skipIndex }
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
          { skipIndex }
        );
        await testIn(
          nullableSchema,
          data,
          {
            cmp: [],
            expected: [],
          },
          { skipIndex }
        );
        await testIn(
          nullableSchema,
          data,
          {
            cmp: [1, null],
            expected: [0, 4],
          },
          { skipIndex }
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
          { skipIndex }
        );

        await testNIn(
          requiredSchema,
          data,
          {
            cmp: [],
            expected: [0, 1, 2, 3, 4],
          },
          { skipIndex }
        );

        await testNIn(
          requiredSchema,
          data,
          {
            cmp: [2, 5],
            expected: [0, 3, 4],
          },
          { skipIndex }
        );

        await testNIn(
          requiredSchema,
          data,
          {
            cmp: [1, 2, 3, 4],
            expected: [],
          },
          { skipIndex }
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
          { skipIndex }
        );

        await testNIn(
          nullableSchema,
          data,
          {
            cmp: [],
            expected: [0, 1, 2, 3, 4],
          },
          { skipIndex }
        );

        await testNIn(
          nullableSchema,
          data,
          {
            cmp: [2, null],
            expected: [0, 2, 3],
          },
          { skipIndex }
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
          { skipIndex }
        );

        await testNIn(
          optionalSchema,
          data,
          {
            cmp: [],
            expected: [0, 1, 2, 3, 4],
          },
          { skipIndex }
        );

        await testNIn(
          optionalSchema,
          data,
          {
            cmp: [1, 2, 3, 4],
            expected: [4],
          },
          { skipIndex }
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

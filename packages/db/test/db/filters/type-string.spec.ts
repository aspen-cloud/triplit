import { it, expect, describe } from 'vitest';
import { Schema as S } from '../../../src/schema/builder.js';
import {
  genData,
  shuffleArray,
  testEq,
  testFilterOp,
  testIn,
  testNEq,
  testNIn,
} from './utils.js';

// If this fails, add tests for the missing operations
it('expected operations are tested', () => {
  expect(new Set(S.String().supportedOperations)).toEqual(
    new Set(['=', '!=', 'like', 'nlike', 'in', 'nin', 'exists'])
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
          { skipIndex }
        );

        // misses on unequal
        await testEq(
          requiredSchema,
          data,
          { cmp: 'd', expected: [] },
          { skipIndex }
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
          { skipIndex }
        );

        // matches on null
        await testEq(
          nullableSchema,
          data,
          { cmp: null, expected: [4] },
          { skipIndex }
        );

        // misses on unequal, no nulls
        await testEq(
          nullableSchema,
          data,
          { cmp: 'd', expected: [] },
          { skipIndex }
        );
      });
      it('optional', async () => {
        const data = genData(['a', 'b', 'b', 'c', undefined]);
        shuffleArray(data);

        // matches on equal, no undefined
        await testEq(
          optionalSchema,
          data,
          { cmp: 'b', expected: [1, 2] },
          { skipIndex }
        );

        // misses on unequal, no undefined
        await testEq(
          optionalSchema,
          data,
          { cmp: 'd', expected: [] },
          { skipIndex }
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
          { skipIndex }
        );

        // all returned if no matches
        await testNEq(
          requiredSchema,
          data,
          { cmp: 'd', expected: [0, 1, 2, 3] },
          { skipIndex }
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
          { skipIndex }
        );

        // can filter out null
        await testNEq(
          nullableSchema,
          data,
          { cmp: null, expected: [0, 1, 2, 3] },
          { skipIndex }
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
          { skipIndex }
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
          { skipIndex }
        );
        // empty arr matches nothing
        await testIn(
          requiredSchema,
          data,
          { cmp: [], expected: [] },
          { skipIndex }
        );
        // supports partial match
        await testIn(
          requiredSchema,
          data,
          { cmp: ['b', 'e'], expected: [1, 2] },
          { skipIndex }
        );
        // no matches returns empty
        await testIn(
          requiredSchema,
          data,
          { cmp: ['e'], expected: [] },
          { skipIndex }
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
          { skipIndex }
        );
        // empty arr matches nothing, no null
        await testIn(
          nullableSchema,
          data,
          { cmp: [], expected: [] },
          { skipIndex }
        );
        // can match on null
        await testIn(
          nullableSchema,
          data,
          { cmp: ['b', null], expected: [1, 4] },
          { skipIndex }
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
          { skipIndex }
        );
        // empty arr matches nothing, no undefined
        await testIn(
          optionalSchema,
          data,
          { cmp: [], expected: [] },
          { skipIndex }
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
          { skipIndex }
        );

        // empty arr matches everything
        await testNIn(
          requiredSchema,
          data,
          { cmp: [], expected: [0, 1, 2, 3, 4] },
          { skipIndex }
        );

        // supports partial match
        await testNIn(
          requiredSchema,
          data,
          { cmp: ['b', 'e'], expected: [0, 3, 4] },
          { skipIndex }
        );

        // all values returns empty
        await testNIn(
          requiredSchema,
          data,
          { cmp: ['a', 'b', 'c', 'd'], expected: [] },
          { skipIndex }
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
          { skipIndex }
        );

        // empty arr matches everything, null included
        await testNIn(
          nullableSchema,
          data,
          { cmp: [], expected: [0, 1, 2, 3, 4] },
          { skipIndex }
        );

        // can filter out null
        await testNIn(
          nullableSchema,
          data,
          { cmp: ['b', null], expected: [0, 2, 3] },
          { skipIndex }
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
          { skipIndex }
        );

        // empty arr matches everything, undefined included
        await testNIn(
          optionalSchema,
          data,
          { cmp: [], expected: [0, 1, 2, 3, 4] },
          { skipIndex }
        );
      });
    });
    describe('exists', () => {
      it('required', async () => {
        const data = genData(['a']);
        shuffleArray(data);

        // string values exist
        await testFilterOp(
          'exists',
          requiredSchema,
          data,
          { cmp: true, expected: [0] },
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

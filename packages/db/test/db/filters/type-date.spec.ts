import { describe, expect, it, test } from 'vitest';
import { Schema as S } from '../../../src/schema/builder.js';
import { shuffleArray } from '../../utils/data.js';
import {
  genData,
  testEq,
  testFilterOp,
  testGt,
  testGte,
  testLt,
  testLte,
  testNEq,
} from './utils.js';

// If this fails, add tests for the missing operations
it('expected operations are tested', () => {
  expect(new Set(S.Date().supportedOperations)).toEqual(
    new Set(['=', '!=', '>', '>=', '<', '<=', 'isDefined'])
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
            attr: S.Date(),
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
            attr: S.Date({ nullable: true }),
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
            attr: S.Optional(S.Date()),
            _idx: S.Number(),
          }),
        },
      },
    };
    describe('=', () => {
      it('required', async () => {
        const data = genData([
          new Date(2021, 1, 1),
          new Date(2021, 1, 2),
          new Date(2021, 1, 2),
          new Date(2021, 1, 3),
        ]);
        shuffleArray(data);

        // matches on equal
        await testEq(
          requiredSchema,
          data,
          {
            cmp: new Date(2021, 1, 2),
            expected: [1, 2],
          },
          { skipIndex }
        );

        // misses on unequal
        await testEq(
          requiredSchema,
          data,
          {
            cmp: new Date(2021, 1, 4),
            expected: [],
          },
          { skipIndex }
        );
      });
      it('nullable', async () => {
        const data = genData([
          new Date(2021, 1, 1),
          new Date(2021, 1, 2),
          new Date(2021, 1, 2),
          new Date(2021, 1, 3),
          null,
        ]);
        shuffleArray(data);

        // matches on equal, no nulls
        await testEq(
          nullableSchema,
          data,
          {
            cmp: new Date(2021, 1, 2),
            expected: [1, 2],
          },
          { skipIndex }
        );
        // matches on null
        await testEq(
          nullableSchema,
          data,
          {
            cmp: null,
            expected: [4],
          },
          { skipIndex }
        );

        // misses on unequal, no nulls
        await testEq(
          nullableSchema,
          data,
          {
            cmp: new Date(2021, 1, 4),
            expected: [],
          },
          { skipIndex }
        );
      });
      it('optional', async () => {
        const data = genData([
          new Date(2021, 1, 1),
          new Date(2021, 1, 2),
          new Date(2021, 1, 2),
          new Date(2021, 1, 3),
          undefined,
        ]);
        shuffleArray(data);

        // matches on equal, no undefined
        await testEq(
          optionalSchema,
          data,
          {
            cmp: new Date(2021, 1, 2),
            expected: [1, 2],
          },
          { skipIndex }
        );
        // misses on unequal, no undefined
        await testEq(
          optionalSchema,
          data,
          {
            cmp: new Date(2021, 1, 4),
            expected: [],
          },
          { skipIndex }
        );
      });
    });
    describe('!=', () => {
      it('required', async () => {
        const data = genData([
          new Date(2021, 1, 1),
          new Date(2021, 1, 2),
          new Date(2021, 1, 2),
          new Date(2021, 1, 3),
        ]);
        shuffleArray(data);

        // matches on unequal
        await testNEq(
          requiredSchema,
          data,
          {
            cmp: new Date(2021, 1, 2),
            expected: [0, 3],
          },
          { skipIndex }
        );
        // all returned if no matches
        await testNEq(
          requiredSchema,
          data,
          {
            cmp: new Date(2021, 1, 4),
            expected: [0, 1, 2, 3],
          },
          { skipIndex }
        );
      });
      it('nullable', async () => {
        const data = genData([
          new Date(2021, 1, 1),
          new Date(2021, 1, 2),
          new Date(2021, 1, 2),
          new Date(2021, 1, 3),
          null,
        ]);
        shuffleArray(data);

        // matches on unequal, includes nulls
        await testNEq(
          nullableSchema,
          data,
          {
            cmp: new Date(2021, 1, 2),
            expected: [0, 3, 4],
          },
          { skipIndex }
        );

        // can filter out null
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
        const data = genData([
          new Date(2021, 1, 1),
          new Date(2021, 1, 2),
          new Date(2021, 1, 2),
          new Date(2021, 1, 3),
          undefined,
        ]);
        shuffleArray(data);

        // matches on unequal, includes undefined
        await testNEq(
          optionalSchema,
          data,
          {
            cmp: new Date(2021, 1, 2),
            expected: [0, 3, 4],
          },
          { skipIndex }
        );
        // all returned if no matches
        await testNEq(
          optionalSchema,
          data,
          {
            cmp: new Date(2021, 1, 4),
            expected: [0, 1, 2, 3, 4],
          },
          { skipIndex }
        );
      });
    });
    describe('>', () => {
      it('required', async () => {
        const data = genData([
          new Date(2021, 1, 1),
          new Date(2021, 1, 2),
          new Date(2021, 1, 3),
          new Date(2021, 1, 4),
        ]);
        shuffleArray(data);

        // matches on greater
        await testGt(
          requiredSchema,
          data,
          {
            cmp: new Date(2021, 1, 2),
            expected: [2, 3],
          },
          { skipIndex }
        );

        // misses if out of range
        await testGt(
          requiredSchema,
          data,
          {
            cmp: new Date(2021, 1, 4),
            expected: [],
          },
          { skipIndex }
        );
      });
      it('nullable', async () => {
        const data = genData([
          new Date(2021, 1, 1),
          new Date(2021, 1, 2),
          new Date(2021, 1, 3),
          new Date(2021, 1, 4),
          null,
        ]);
        shuffleArray(data);

        // matches on greater, nulls not gt
        await testGt(
          nullableSchema,
          data,
          {
            cmp: new Date(2021, 1, 2),
            expected: [2, 3],
          },
          { skipIndex }
        );
        // misses out of range, nulls not gt
        await testGt(
          nullableSchema,
          data,
          {
            cmp: new Date(2021, 1, 4),
            expected: [],
          },
          { skipIndex }
        );
        // gt null includes all non-nulls
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
        const data = genData([
          new Date(2021, 1, 1),
          new Date(2021, 1, 2),
          new Date(2021, 1, 3),
          new Date(2021, 1, 4),
          undefined,
        ]);
        shuffleArray(data);

        // matches on greater, undefined not gt
        await testGt(
          optionalSchema,
          data,
          {
            cmp: new Date(2021, 1, 2),
            expected: [2, 3],
          },
          { skipIndex }
        );
        // misses out of range, undefined not gt
        await testGt(
          optionalSchema,
          data,
          {
            cmp: new Date(2021, 1, 4),
            expected: [],
          },
          { skipIndex }
        );
      });
    });
    describe('>=', () => {
      it('required', async () => {
        const data = genData([
          new Date(2021, 1, 1),
          new Date(2021, 1, 2),
          new Date(2021, 1, 3),
          new Date(2021, 1, 4),
        ]);
        shuffleArray(data);

        // matches on greater or equal
        await testGte(
          requiredSchema,
          data,
          {
            cmp: new Date(2021, 1, 2),
            expected: [1, 2, 3],
          },
          { skipIndex }
        );
        // matches on equal at end of range
        await testGte(
          requiredSchema,
          data,
          {
            cmp: new Date(2021, 1, 4),
            expected: [3],
          },
          { skipIndex }
        );
        // misses if out of range
        await testGte(
          requiredSchema,
          data,
          {
            cmp: new Date(2021, 1, 5),
            expected: [],
          },
          { skipIndex }
        );
      });
      it('nullable', async () => {
        const data = genData([
          new Date(2021, 1, 1),
          new Date(2021, 1, 2),
          new Date(2021, 1, 3),
          new Date(2021, 1, 4),
          null,
        ]);
        shuffleArray(data);

        // matches on greater or equal, nulls not gte
        await testGte(
          nullableSchema,
          data,
          {
            cmp: new Date(2021, 1, 2),
            expected: [1, 2, 3],
          },
          { skipIndex }
        );

        // gte null includes all, including nulls
        await testGte(
          nullableSchema,
          data,
          {
            cmp: null,
            expected: [0, 1, 2, 3, 4],
          },
          { skipIndex }
        );
        // misses if out of range, nulls not gte
        await testGte(
          nullableSchema,
          data,
          {
            cmp: new Date(2021, 1, 5),
            expected: [],
          },
          { skipIndex }
        );
      });
      it('optional', async () => {
        const data = genData([
          new Date(2021, 1, 1),
          new Date(2021, 1, 2),
          new Date(2021, 1, 3),
          new Date(2021, 1, 4),
          undefined,
        ]);
        shuffleArray(data);

        // matches on greater or equal, undefined not gte
        await testGte(
          optionalSchema,
          data,
          {
            cmp: new Date(2021, 1, 2),
            expected: [1, 2, 3],
          },
          { skipIndex }
        );
        // out of range, undefined not gte
        await testGte(
          optionalSchema,
          data,
          {
            cmp: new Date(2021, 1, 5),
            expected: [],
          },
          { skipIndex }
        );
      });
    });
    describe('<', () => {
      it('required', async () => {
        const data = genData([
          new Date(2021, 1, 1),
          new Date(2021, 1, 2),
          new Date(2021, 1, 3),
          new Date(2021, 1, 4),
        ]);
        shuffleArray(data);

        // matches on less
        await testLt(
          requiredSchema,
          data,
          {
            cmp: new Date(2021, 1, 3),
            expected: [0, 1],
          },
          { skipIndex }
        );

        // misses if out of range
        await testLt(
          requiredSchema,
          data,
          {
            cmp: new Date(2021, 1, 1),
            expected: [],
          },
          { skipIndex }
        );
      });
      it('nullable', async () => {
        const data = genData([
          new Date(2021, 1, 1),
          new Date(2021, 1, 2),
          new Date(2021, 1, 3),
          new Date(2021, 1, 4),
          null,
        ]);
        shuffleArray(data);

        // matches on less, nulls are lt
        await testLt(
          nullableSchema,
          data,
          {
            cmp: new Date(2021, 1, 3),
            expected: [0, 1, 4],
          },
          { skipIndex }
        );
        // misses if out of range, nulls lt
        await testLt(
          nullableSchema,
          data,
          {
            cmp: new Date(2021, 1, 1),
            expected: [4],
          },
          { skipIndex }
        );
        // lt null includes none
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
        const data = genData([
          new Date(2021, 1, 1),
          new Date(2021, 1, 2),
          new Date(2021, 1, 3),
          new Date(2021, 1, 4),
          undefined,
        ]);
        shuffleArray(data);

        // matches on less, undefined not lt
        await testLt(
          optionalSchema,
          data,
          {
            cmp: new Date(2021, 1, 3),
            expected: [0, 1],
          },
          { skipIndex }
        );
        // misses if out of range, undefined not lt
        await testLt(
          optionalSchema,
          data,
          {
            cmp: new Date(2021, 1, 1),
            expected: [],
          },
          { skipIndex }
        );
      });
    });
    describe('<=', () => {
      it('required', async () => {
        const data = genData([
          new Date(2021, 1, 1),
          new Date(2021, 1, 2),
          new Date(2021, 1, 3),
          new Date(2021, 1, 4),
        ]);
        shuffleArray(data);

        // matches on less or equal
        await testLte(
          requiredSchema,
          data,
          {
            cmp: new Date(2021, 1, 3),
            expected: [0, 1, 2],
          },
          { skipIndex }
        );
        // matches on equal at end of range
        await testLte(
          requiredSchema,
          data,
          {
            cmp: new Date(2021, 1, 1),
            expected: [0],
          },
          { skipIndex }
        );
        // misses if out of range
        await testLte(
          requiredSchema,
          data,
          {
            cmp: new Date(2020, 1, 1),
            expected: [],
          },
          { skipIndex }
        );
      });
      it('nullable', async () => {
        const data = genData([
          new Date(2021, 1, 1),
          new Date(2021, 1, 2),
          new Date(2021, 1, 3),
          new Date(2021, 1, 4),
          null,
        ]);
        shuffleArray(data);

        // matches on less or equal, nulls are lte
        await testLte(
          nullableSchema,
          data,
          {
            cmp: new Date(2021, 1, 3),
            expected: [0, 1, 2, 4],
          },
          { skipIndex }
        );
        // lte null is just  nulls
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
        const data = genData([
          new Date(2021, 1, 1),
          new Date(2021, 1, 2),
          new Date(2021, 1, 3),
          new Date(2021, 1, 4),
          undefined,
        ]);
        shuffleArray(data);

        // matches on less or equal, undefined not lte
        await testLte(
          optionalSchema,
          data,
          {
            cmp: new Date(2021, 1, 3),
            expected: [0, 1, 2],
          },
          { skipIndex }
        );
        // misses if out of range, undefined not lte
        await testLte(
          optionalSchema,
          data,
          {
            cmp: new Date(2020, 1, 1),
            expected: [],
          },
          { skipIndex }
        );
      });
    });
    describe('isDefined', () => {
      it('required', async () => {
        const data = genData([new Date(2021, 1, 1)]);
        shuffleArray(data);

        // date values exist
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

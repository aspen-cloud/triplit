import { it, describe } from 'vitest';
import { Schema as S } from '../../src/schema/builder.js';
import { genData, shuffleArray, TEST_OPTIONS } from '../filters/utils.js';
import { testOrder } from '../filters/utils.js';

const schema = {
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

describe.each(TEST_OPTIONS)('$engine', (options) => {
  it('Can order by child attribute', async () => {
    const data = genData([{ a: 1 }, { a: '2' }, { a: 3 }]);
    shuffleArray(data);
    await testOrder(
      'attr.a',
      schema,
      data,
      {
        dir: 'ASC',
        expected: [0, 2, 1],
      },
      options
    );
    await testOrder(
      'attr.a',
      schema,
      data,
      {
        dir: 'DESC',
        expected: [1, 2, 0],
      },
      options
    );
  });

  it('Handles unorderable attributes', async () => {
    const data = genData([{ a: 1 }, { a: {} }, { a: 3 }]);
    shuffleArray(data);
    await testOrder(
      'attr.a',
      schema,
      data,
      {
        dir: 'ASC',
        expected: [1, 0, 2],
      },
      options
    );
    await testOrder(
      'attr.a',
      schema,
      data,
      {
        dir: 'DESC',
        expected: [2, 0, 1],
      },
      options
    );
  });
});

import { CollectionQuery } from '../dist/types';
import { hasSubqueryFilterAtAnyLevel } from '../src/ivm/utils';
import { expect, test } from 'vitest';

test('hasSubqueryFilterAtAnyLevel', () => {
  {
    const query: CollectionQuery = {
      collectionName: 'Users',
      where: [['age', '>', 30]],
    };
    expect(hasSubqueryFilterAtAnyLevel(query)).toBe(false);
  }
  {
    const query: CollectionQuery = {
      collectionName: 'Users',
      where: [
        { exists: { collectionName: 'Users', where: [['age', '>', 30]] } },
      ],
    };
    expect(hasSubqueryFilterAtAnyLevel(query)).toBe(true);
  }
  {
    const query: CollectionQuery = {
      collectionName: 'Users',
      where: [['age', '>', 30]],
      include: {
        friends: {
          subquery: {
            collectionName: 'Users',
            where: [['age', '>', 30]],
          },
          cardinality: 'many',
        },
      },
    };
    expect(hasSubqueryFilterAtAnyLevel(query)).toBe(false);
  }
  {
    const query: CollectionQuery = {
      collectionName: 'Users',
      where: [['age', '>', 30]],
      include: {
        friends: {
          subquery: {
            collectionName: 'Users',
            where: [
              ['age', '>', 30],
              {
                exists: { collectionName: 'Users', where: [['age', '>', 30]] },
              },
            ],
          },
          cardinality: 'many',
        },
      },
    };
    expect(hasSubqueryFilterAtAnyLevel(query)).toBe(true);
  }
});

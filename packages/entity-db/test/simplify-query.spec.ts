import { describe, expect, it } from 'vitest';
import { simplifyQuery } from '../src/simplify-query.js';

describe('filter simplification', () => {
  it('allows undefined where', () => {
    const simplified = simplifyQuery({
      collectionName: 'test',
      where: undefined,
    });
    expect(simplified).toEqual({ collectionName: 'test' });
  });
  it('drops empty filter groups', () => {
    {
      const simplified = simplifyQuery({
        collectionName: 'test',
        where: [
          {
            mod: 'and',
            filters: [],
          },
        ],
      });
      expect(simplified).toEqual({ collectionName: 'test' });
    }
    {
      const simplified = simplifyQuery({
        collectionName: 'test',
        where: [
          {
            mod: 'or',
            filters: [],
          },
        ],
      });
      expect(simplified).toEqual({ collectionName: 'test' });
    }
  });
  it('drops grouping if it contains only one filter', () => {
    {
      const simplified = simplifyQuery({
        collectionName: 'test',
        where: [
          {
            mod: 'and',
            filters: [['id', '=', 1]],
          },
        ],
      });
      expect(simplified).toEqual({
        collectionName: 'test',
        where: [['id', '=', 1]],
      });
    }
    {
      const simplified = simplifyQuery({
        collectionName: 'test',
        where: [
          {
            mod: 'or',
            filters: [['id', '=', 1]],
          },
        ],
      });
      expect(simplified).toEqual({
        collectionName: 'test',
        where: [['id', '=', 1]],
      });
    }
  });

  it('retains filter groups with n > 1', () => {
    const simplified = simplifyQuery({
      collectionName: 'test',
      where: [
        {
          mod: 'or',
          filters: [
            ['id', '=', 1],
            {
              mod: 'and',
              filters: [
                ['id', '=', 2],
                ['id', '=', 3],
              ],
            },
          ],
        },
      ],
    });
    expect(simplified).toEqual({
      collectionName: 'test',
      where: [
        {
          mod: 'or',
          filters: [
            ['id', '=', 1],
            {
              mod: 'and',
              filters: [
                ['id', '=', 2],
                ['id', '=', 3],
              ],
            },
          ],
        },
      ],
    });
  });

  // a && (b && c) === a && b && c
  it('merges filter groups with parent group if the mod is the same', () => {
    // Implicity AND at the root
    {
      const simplified = simplifyQuery({
        collectionName: 'test',
        where: [
          ['id', '=', 1],
          {
            mod: 'and',
            filters: [
              ['id', '=', 2],
              ['id', '=', 3],
            ],
          },
        ],
      });
      expect(simplified).toEqual({
        collectionName: 'test',
        where: [
          ['id', '=', 1],
          ['id', '=', 2],
          ['id', '=', 3],
        ],
      });
    }
    // Using mod AND
    {
      const simplified = simplifyQuery({
        collectionName: 'test',
        where: [
          {
            mod: 'or',
            filters: [
              ['id', '=', 1],
              {
                mod: 'and',
                filters: [
                  ['id', '=', 2],
                  {
                    mod: 'and',
                    filters: [
                      ['id', '=', 3],
                      ['id', '=', 4],
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
      expect(simplified).toEqual({
        collectionName: 'test',
        where: [
          {
            mod: 'or',
            filters: [
              ['id', '=', 1],
              {
                mod: 'and',
                filters: [
                  ['id', '=', 2],
                  ['id', '=', 3],
                  ['id', '=', 4],
                ],
              },
            ],
          },
        ],
      });
    }
    // Using mod OR
    {
      const simplified = simplifyQuery({
        collectionName: 'test',
        where: [
          {
            mod: 'or',
            filters: [
              ['id', '=', 1],
              {
                mod: 'or',
                filters: [
                  ['id', '=', 2],
                  ['id', '=', 3],
                ],
              },
            ],
          },
        ],
      });
      expect(simplified).toEqual({
        collectionName: 'test',
        where: [
          {
            mod: 'or',
            filters: [
              ['id', '=', 1],
              ['id', '=', 2],
              ['id', '=', 3],
            ],
          },
        ],
      });
    }
  });

  /**
   * A filter like:
   * where: [
   *  OR(AND(clause1, clause2))
   * ]
   *
   * should remote the outer OR because there's only one clause, then because the AND matches the root where filter it should result in [clause1, clause2]
   */
  it('merges filter group with parent after simplification', () => {
    const simplified = simplifyQuery({
      collectionName: 'test',
      where: [
        {
          mod: 'or',
          filters: [
            {
              mod: 'and',
              filters: [
                ['id', '=', 1],
                ['id', '=', 2],
              ],
            },
          ],
        },
      ],
    });
    expect(simplified).toEqual({
      collectionName: 'test',
      where: [
        ['id', '=', 1],
        ['id', '=', 2],
      ],
    });
  });

  // true && a === a
  // false && a === false
  // true || a === true
  // false || a === a
  it('collapses overriding boolean operators', () => {
    {
      const simplified = simplifyQuery({
        collectionName: 'test',
        where: [false, ['id', '=', 1]],
      });
      expect(simplified).toEqual({
        collectionName: 'test',
        where: [false],
      });
    }
    {
      const simplified = simplifyQuery({
        collectionName: 'test',
        where: [true, ['id', '=', 1]],
      });
      expect(simplified).toEqual({
        collectionName: 'test',
        where: [true, ['id', '=', 1]],
      });
    }
    {
      const simplified = simplifyQuery({
        collectionName: 'test',
        where: [
          {
            mod: 'or',
            filters: [true, ['id', '=', 1]],
          },
        ],
      });
      expect(simplified).toEqual({
        collectionName: 'test',
        where: [true],
      });
    }
    {
      const simplified = simplifyQuery({
        collectionName: 'test',
        where: [
          {
            mod: 'or',
            filters: [false, ['id', '=', 1]],
          },
        ],
      });
      expect(simplified).toEqual({
        collectionName: 'test',
        where: [{ mod: 'or', filters: [false, ['id', '=', 1]] }],
      });
    }
  });
});

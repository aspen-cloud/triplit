import { describe, expect, it } from 'vitest';
import { simplifyQuery } from '../src/query/simplify-query.js';

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

  it('simplifies subquery filters', () => {
    const simplified = simplifyQuery({
      collectionName: 'test',
      where: [
        {
          exists: {
            collectionName: 'test2',
            where: [
              // should simplify this to one filter statement
              {
                mod: 'or',
                filters: [['id', '=', 1]],
              },
            ],
          },
        },
      ],
    });
    expect(simplified).toEqual({
      collectionName: 'test',
      where: [
        {
          exists: {
            collectionName: 'test2',
            where: [['id', '=', 1]],
          },
        },
      ],
    });
  });

  /**
   * { exists: { collectionName: 'test2', where: [false] } } === false
   * { exists: { collectionName: 'test2', where: [true] } } ===> SHOULD NOT COLLAPSE, would be false if empty
   */
  it('simplifies subquery filters with a boolean false filter', () => {
    // A false filter in a subquery will always return empty, so exists will be false
    {
      const simplified = simplifyQuery({
        collectionName: 'test',
        where: [
          {
            exists: {
              collectionName: 'test2',
              where: [['id', '=', 1], false],
            },
          },
        ],
      });
      expect(simplified).toEqual({
        collectionName: 'test',
        where: [false],
      });
    }
    // A true filter in a subquery will not collapse the exists clause, because it could be empty
    {
      const simplified = simplifyQuery({
        collectionName: 'test',
        where: [
          {
            exists: {
              collectionName: 'test2',
              where: [true],
            },
          },
        ],
      });
      expect(simplified).toEqual({
        collectionName: 'test',
        where: [
          {
            exists: {
              collectionName: 'test2',
              where: [true],
            },
          },
        ],
      });
    }
  });

  describe('deduplication', () => {
    it('de-dupes simple filter statements', () => {
      const simplified = simplifyQuery({
        collectionName: 'test',
        where: [['id', '=', 1], ['id', '=', 1], true, true],
      });

      expect(simplified).toEqual({
        collectionName: 'test',
        where: [['id', '=', 1], true],
      });
    });
    it('recursively de-dupes exists filters', () => {
      const simplified = simplifyQuery({
        collectionName: 'messages',
        where: [
          {
            exists: {
              collectionName: 'conversations',
              where: [
                ['id', '=', '$1.conversationId'],
                ['members', '=', 'user-1'],
                ['members', '=', 'user-1'],
              ],
            },
          },
        ],
      });

      expect(simplified).toEqual({
        collectionName: 'messages',
        where: [
          {
            exists: {
              collectionName: 'conversations',
              where: [
                ['id', '=', '$1.conversationId'],
                ['members', '=', 'user-1'],
              ],
            },
          },
        ],
      });
    });
    it('de-dupes exists queries', () => {
      const simplified = simplifyQuery({
        collectionName: 'messages',
        where: [
          {
            exists: {
              collectionName: 'conversations',
              where: [
                ['id', '=', '$1.conversationId'],
                ['members', '=', 'user-1'],
              ],
            },
          },
          {
            exists: {
              collectionName: 'conversations',
              // Order of filters does not matter
              where: [
                ['members', '=', 'user-1'],
                ['id', '=', '$1.conversationId'],
              ],
            },
          },
        ],
      });

      expect(simplified).toEqual({
        collectionName: 'messages',
        where: [
          {
            exists: {
              collectionName: 'conversations',
              where: [
                ['id', '=', '$1.conversationId'],
                ['members', '=', 'user-1'],
              ],
            },
          },
        ],
      });
    });
    it('de-dupes exists filters in inclusions', () => {
      const simplified = simplifyQuery({
        collectionName: 'messages',
        include: {
          reactions: {
            subquery: {
              collectionName: 'reactions',
              where: [
                ['messageId', '=', '$1.id'],
                {
                  exists: {
                    collectionName: 'messages',
                    where: [
                      ['id', '=', '$1.messageId'],
                      {
                        exists: {
                          collectionName: 'conversations',
                          where: [
                            ['members', '=', 'user-1'],
                            ['members', '=', 'user-1'],
                            ['id', '=', '$1.conversationId'],
                          ],
                        },
                      },
                      {
                        exists: {
                          collectionName: 'conversations',
                          where: [
                            ['id', '=', '$1.conversationId'],
                            ['members', '=', 'user-1'],
                            ['members', '=', 'user-1'],
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
            cardinality: 'many',
          },
        },
      });
      expect(simplified).toEqual({
        collectionName: 'messages',
        include: {
          reactions: {
            subquery: {
              collectionName: 'reactions',
              where: [
                ['messageId', '=', '$1.id'],
                {
                  exists: {
                    collectionName: 'messages',
                    where: [
                      ['id', '=', '$1.messageId'],
                      {
                        exists: {
                          collectionName: 'conversations',
                          where: [
                            ['members', '=', 'user-1'],
                            ['id', '=', '$1.conversationId'],
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
            cardinality: 'many',
          },
        },
      });
    });
    it('de-dupes filter groups', () => {
      const simplified = simplifyQuery({
        collectionName: 'messages',
        where: [
          {
            mod: 'or',
            filters: [
              ['id', '=', '$1.conversationId'],
              ['wild', '=', '$1.conversationId'],
            ],
          },
          {
            mod: 'or',
            filters: [
              ['wild', '=', '$1.conversationId'],
              ['id', '=', '$1.conversationId'],
            ],
          },
        ],
      });
      expect(simplified).toEqual({
        collectionName: 'messages',
        where: [
          {
            mod: 'or',
            filters: [
              ['id', '=', '$1.conversationId'],
              ['wild', '=', '$1.conversationId'],
            ],
          },
        ],
      });
    });
  });
});

describe('order simplification', () => {
  it('allows undefined order', () => {
    const simplified = simplifyQuery({
      collectionName: 'test',
      order: undefined,
    });
    expect(simplified).toEqual({ collectionName: 'test' });
  });
  it('drops empty order groups', () => {
    const simplified = simplifyQuery({
      collectionName: 'test',
      order: [],
    });
    expect(simplified).toEqual({ collectionName: 'test' });
  });
  it('simplifies order subqueries', () => {
    const simplified = simplifyQuery({
      collectionName: 'test',
      order: [
        [
          'id',
          'ASC',
          {
            subquery: {
              collectionName: 'test2',
              where: [
                {
                  mod: 'or',
                  filters: [['id', '=', 1]],
                },
              ],
            },
            cardinality: 'one',
          },
        ],
      ],
    });
    expect(simplified).toEqual({
      collectionName: 'test',
      order: [
        [
          'id',
          'ASC',
          {
            subquery: {
              collectionName: 'test2',
              where: [['id', '=', 1]],
            },
            cardinality: 'one',
          },
        ],
      ],
    });
  });
});

describe('inclusion simplification', () => {
  it('allows undefined include', () => {
    const simplified = simplifyQuery({
      collectionName: 'test',
      include: undefined,
    });
    expect(simplified).toEqual({ collectionName: 'test' });
  });
  it('drops empty include groups', () => {
    const simplified = simplifyQuery({
      collectionName: 'test',
      include: {},
    });
    expect(simplified).toEqual({ collectionName: 'test' });
  });
  it('simplifies subquery definitions', () => {
    const simplified = simplifyQuery({
      collectionName: 'test',
      include: {
        test: {
          subquery: {
            collectionName: 'test2',
            where: [{ mod: 'or', filters: [['id', '=', 1]] }],
          },
          cardinality: 'one',
        },
      },
    });
    expect(simplified).toEqual({
      collectionName: 'test',
      include: {
        test: {
          subquery: {
            collectionName: 'test2',
            where: [['id', '=', 1]],
          },
          cardinality: 'one',
        },
      },
    });
  });
});

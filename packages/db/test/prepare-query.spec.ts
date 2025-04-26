import { it, describe, expect } from 'vitest';
import { prepareQuery } from '../src/query/prepare-query.js';
import { Schema as S } from '../src/schema/builder.js';
import {
  InvalidQueryAfterError,
  InvalidQueryInclusionError,
  InvalidQueryLimitError,
  InvalidQueryWhereError,
  SessionVariableNotFoundError,
  IncludedNonRelationError,
  InvalidCollectionNameError,
  InvalidFilterError,
  InvalidOrderClauseError,
  InvalidQueryCardinalityError,
  InvalidSelectClauseError,
  RelationDoesNotExistError,
} from '../src/errors.js';
import { exists } from '../src/filters.js';
import { DBSchema } from '../src/db.js';

const USER_SCHEMA = {
  users: {
    schema: S.Schema({
      id: S.Id(),
      name: S.String(),
    }),
  },
};

const USER_PROFILE_SCHEMA = S.Collections({
  users: {
    schema: S.Schema({
      id: S.Id(),
      name: S.String(),
      emails: S.Set(S.String(), { default: S.Default.Set.empty() }),
      profileId: S.String(),
    }),
    relationships: {
      profile: S.RelationById('profiles', '$1.profileId'),
    },
  },
  profiles: {
    schema: S.Schema({
      id: S.Id(),
      userId: S.String(),
      bio: S.String(),
    }),
  },
});

const USER_PROFILE_POST_SCHEMA = S.Collections({
  users: {
    schema: S.Schema({
      id: S.Id(),
      name: S.String(),
      profileId: S.String(),
    }),
    relationships: {
      profile: S.RelationById('profiles', '$1.profileId'),
      posts: S.RelationMany('posts', {
        where: [['authorId', '=', '$1.id']],
      }),
    },
  },
  profiles: {
    schema: S.Schema({
      id: S.Id(),
      userId: S.String(),
      bio: S.String(),
    }),
    relationships: {
      user: S.RelationById('users', '$1.userId'),
    },
  },
  posts: {
    schema: S.Schema({
      id: S.Id(),
      authorId: S.String(),
      content: S.String(),
    }),
    relationships: {
      author: S.RelationById('users', '$1.authorId'),
    },
  },
});

const ROLES = {
  authenticated: {
    match: {
      role: 'user',
      userId: '$userId',
    },
  },
  admin: {
    match: {
      role: 'admin',
    },
  },
};

const PERMISSIONED_SCHEMA = S.Collections({
  users: {
    schema: S.Schema({
      id: S.Id(),
      name: S.String(),
      profileId: S.String(),
    }),
    relationships: {
      profile: S.RelationById('profiles', '$1.profileId'),
    },
    permissions: {
      authenticated: {
        read: {
          filter: [['id', '=', '$role.userId']],
        },
      },
      admin: {
        read: {
          filter: [true],
        },
      },
    },
  },
  profiles: {
    schema: S.Schema({
      id: S.Id(),
      userId: S.String(),
      bio: S.String(),
    }),
    relationships: {
      user: S.RelationById('users', '$1.userId'),
    },
  },
});

describe('collectionName', () => {
  it('validates that it is a string', () => {
    // Valid string
    {
      const query = prepareQuery(
        { collectionName: 'test' },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      );
      expect(query.collectionName).toBe('test');
    }

    // non string value
    expect(() =>
      prepareQuery(
        {
          // @ts-expect-error
          collectionName: 1,
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidCollectionNameError);

    // undefined
    expect(() =>
      prepareQuery(
        {
          // @ts-expect-error
          collectionName: undefined,
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidCollectionNameError);

    // not provided
    expect(() =>
      prepareQuery(
        // @ts-expect-error
        {},
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidCollectionNameError);
  });
  it('validates that it is in the schema', () => {
    const schema = USER_SCHEMA;
    // Collection in schema
    {
      const query = prepareQuery(
        { collectionName: 'users' },
        schema,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      );
      expect(query.collectionName).toBe('users');
    }

    // Collection not in schema
    expect(() =>
      prepareQuery({ collectionName: 'invalid' }, schema, {}, undefined, {
        applyPermission: undefined,
      })
    ).toThrow(InvalidCollectionNameError);
  });
});

describe('select', () => {
  it('accepts an undefined select', () => {
    const query = prepareQuery(
      { collectionName: 'users' },
      undefined,
      {},
      undefined,
      {
        applyPermission: undefined,
      }
    );
    expect(query.select).toBeUndefined();
  });

  it('accepts a string array', () => {
    const query = prepareQuery(
      { collectionName: 'users', select: ['id', 'name'] },
      undefined,
      {},
      undefined,
      {
        applyPermission: undefined,
      }
    );
    expect(query.select).toEqual(['id', 'name']);
  });

  it('rejects a non string array', () => {
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          select: [
            'id',
            // @ts-expect-error
            1,
          ],
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidSelectClauseError);
  });

  it('validates that the select is in the schema', () => {
    const schema = {
      users: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
          birthday: S.Record({
            day: S.Number(),
            month: S.Number(),
            year: S.Number(),
          }),
        }),
      },
    };
    // valid path, root record path and nested path
    {
      const query = prepareQuery(
        {
          collectionName: 'users',
          select: ['name', 'birthday', 'birthday.day'],
        },
        schema,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      );
      expect(query.select).toEqual(['name', 'birthday', 'birthday.day']);
    }

    // invalid root path
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          select: ['invalid'],
        },
        schema,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidSelectClauseError);

    // invalid nested path
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          select: ['birthday.invalid'],
        },
        schema,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidSelectClauseError);
  });

  it('cannot select into relationships', () => {
    const schema = USER_PROFILE_SCHEMA;

    // select relationship
    expect(() => {
      prepareQuery(
        {
          collectionName: 'users',
          select: ['profile'],
        },
        schema,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      );
    }).toThrow(InvalidSelectClauseError);

    // Select path in relationship
    expect(() => {
      prepareQuery(
        {
          collectionName: 'users',
          select: ['profile.bio'],
        },
        schema,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      );
    }).toThrow(InvalidSelectClauseError);
  });
});

describe('include', () => {
  it('accepts an undefined include', () => {
    const query = prepareQuery(
      { collectionName: 'users' },
      undefined,
      {},
      undefined,
      {
        applyPermission: undefined,
      }
    );
    expect(query.include).toBeUndefined();
  });

  it('accepts an empty object', () => {
    const query = prepareQuery(
      { collectionName: 'users', include: {} },
      undefined,
      {},
      undefined,
      {
        applyPermission: undefined,
      }
    );
    expect(query.include).toBeUndefined();
  });

  it('accepts subqueries', () => {
    const query = prepareQuery(
      {
        collectionName: 'users',
        include: {
          profile: {
            subquery: {
              collectionName: 'profile',
              select: ['bio'],
            },
            cardinality: 'many',
          },
        },
      },
      undefined,
      {},
      undefined,
      {
        applyPermission: undefined,
      }
    );
    expect(query.include).toEqual({
      profile: {
        subquery: {
          collectionName: 'profile',
          select: ['bio'],
        },
        cardinality: 'many',
      },
    });
  });

  it('rejects invalid subqueries', () => {
    // Subquery cannot be prepared
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          include: {
            profile: {
              // @ts-expect-error
              subquery: {},
              cardinality: 'many',
            },
          },
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidCollectionNameError);
  });

  it('schemaless - rejects non subqueries', () => {
    // Schemaless doesnt know what to do with shorthands
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          include: {
            profile: true,
          },
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidQueryInclusionError);

    // Schemaless doesnt know what to do with shorthands
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          include: {
            profile: null,
          },
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidQueryInclusionError);

    // Schemaless doesnt know what to do with ref subqueries
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          include: {
            profile_bio: {
              _extends: 'profile',
              select: ['bio'],
            },
          },
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidQueryInclusionError);
  });

  it('rejects invalid cardinality values', () => {
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          include: {
            profile: {
              subquery: {
                collectionName: 'profile',
              },
              // @ts-expect-error
              cardinality: 'invalid',
            },
          },
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidQueryCardinalityError);
  });

  it('transforms shorthands from schema', () => {
    const schema = USER_PROFILE_SCHEMA;
    // true as shorthand
    {
      const query = prepareQuery(
        {
          collectionName: 'users',
          include: {
            profile: true,
          },
        },
        schema,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      );
      expect(query).toEqual({
        collectionName: 'users',
        include: {
          profile: {
            subquery: {
              collectionName: 'profiles',
              where: [['id', '=', '$1.profileId']],
            },
            cardinality: 'one',
          },
        },
      });
    }

    // null as shorthand
    {
      const query = prepareQuery(
        {
          collectionName: 'users',
          include: {
            profile: null,
          },
        },
        schema,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      );
      expect(query).toEqual({
        collectionName: 'users',
        include: {
          profile: {
            subquery: {
              collectionName: 'profiles',
              where: [['id', '=', '$1.profileId']],
            },
            cardinality: 'one',
          },
        },
      });
    }
  });
  it('rejects if shorthand alias is not in schema', () => {
    const schema = USER_PROFILE_SCHEMA;
    expect(() => {
      prepareQuery(
        {
          collectionName: 'users',
          include: {
            invalid: true,
          },
        },
        schema,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      );
    }).toThrow(RelationDoesNotExistError);
  });
  it('rejects if shorthand alias is not a relation', () => {
    const schema = USER_PROFILE_SCHEMA;
    expect(() => {
      prepareQuery(
        {
          collectionName: 'users',
          include: {
            name: true,
          },
        },
        schema,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      );
    }).toThrow(IncludedNonRelationError);
  });
  it('transforms relational subqueries from schema', () => {
    const schema = USER_PROFILE_SCHEMA;
    // true as shorthand
    {
      const query = prepareQuery(
        {
          collectionName: 'users',
          include: {
            profile_bio: {
              _extends: 'profile',
              select: ['bio'],
            },
          },
        },
        schema,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      );
      expect(query).toEqual({
        collectionName: 'users',
        include: {
          profile_bio: {
            subquery: {
              collectionName: 'profiles',
              select: ['bio'],
              where: [['id', '=', '$1.profileId']],
            },
            cardinality: 'one',
          },
        },
      });
    }
  });
  it.todo('test query merging specifics');
  it('rejects if relational subquery alias is not in schema', () => {
    const schema = USER_PROFILE_SCHEMA;
    expect(() => {
      prepareQuery(
        {
          collectionName: 'users',
          include: {
            profile_bio: {
              _extends: 'invalid',
              select: ['bio'],
            },
          },
        },
        schema,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      );
    }).toThrow(RelationDoesNotExistError);
  });
  it('rejects if relational subquery alias is not a relation', () => {
    const schema = USER_PROFILE_SCHEMA;
    expect(() => {
      prepareQuery(
        {
          collectionName: 'users',
          include: {
            profile_bio: {
              _extends: 'name',
              select: ['bio'],
            },
          },
        },
        schema,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      );
    }).toThrow(IncludedNonRelationError);
  });
});

describe('where', () => {
  it('accepts an undefined where', () => {
    const query = prepareQuery(
      { collectionName: 'users' },
      undefined,
      {},
      undefined,
      {
        applyPermission: undefined,
      }
    );
    expect(query.where).toBeUndefined();
  });

  it('rejects invalid filter formats', () => {
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          // @ts-expect-error
          where: 1,
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidQueryWhereError);

    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          where: [
            // @ts-expect-error
            1,
          ],
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidFilterError);
  });
  it('appends permissions filters if permissions are present in the schema', () => {
    const query = prepareQuery(
      {
        collectionName: 'users',
      },
      PERMISSIONED_SCHEMA,
      {},
      {
        vars: {},
        roles: [
          {
            key: 'authenticated',
            roleVars: {
              userId: 'test',
            },
          },
        ],
      },
      {
        applyPermission: 'read',
      }
    );
    expect(query.where).toEqual([['id', '=', 'test']]);
  });
  it('appends denial filter if permissions are present but cannot match any roles', () => {
    const schema: DBSchema = {
      roles: {
        authenticated: {
          match: {
            userId: '$userId',
          },
        },
      },
      collections: {
        test: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
      },
    };
    const permissionCases: any[] = [
      {},
      { authenticated: {} },
      { authenticated: { read: {} } },
      { authenticated: { read: { filter: [] } } },
    ];
    for (const permissions of permissionCases) {
      schema.collections.test.permissions = permissions;
      const query = prepareQuery(
        {
          collectionName: 'test',
        },
        schema?.collections,
        {},
        {
          vars: {},
          roles: [
            {
              key: 'authenticated',
              roleVars: {
                userId: 'test',
              },
            },
          ],
        },
        {
          applyPermission: 'read',
        }
      );

      // All cases should have the denial filter appended
      expect(query.where).toEqual([false]);
    }
  });

  // Important for selective public access
  it('replaces query variables in permission filters', () => {
    const schema = S.Collections({
      test: {
        schema: S.Schema({
          id: S.Id(),
        }),
        permissions: {
          authenticated: {
            read: {
              filter: [['id', '=', '$query.testId']],
            },
          },
        },
      },
    });
    const query = prepareQuery(
      {
        collectionName: 'test',
        vars: {
          testId: 'test',
        },
      },
      schema,
      {},
      {
        vars: {},
        roles: [
          {
            key: 'authenticated',
            roleVars: {
              testId: 'test',
            },
          },
        ],
      },
      {
        applyPermission: 'read',
      }
    );
    expect(query.where).toEqual([['id', '=', 'test']]);
  });

  describe('boolean filters', () => {
    // TODO: rewrite after removing simplifyQuery from prepareQuery
    //     it('accepts boolean filters and returns them as is', () => {
    it('accepts boolean filters and merges them', () => {
      const query = prepareQuery(
        {
          collectionName: 'users',
          where: [true, false, true, false],
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      );
      expect(query.where).toEqual([false]);
    });
  });

  describe('filter groups', () => {
    it('rejects filters with an invalid mod', () => {
      expect(() =>
        prepareQuery(
          {
            collectionName: 'users',
            where: [
              // @ts-expect-error
              { mod: 'invalid', filters: [true] },
            ],
          },
          undefined,
          {},
          undefined,
          {
            applyPermission: undefined,
          }
        )
      ).toThrow(InvalidFilterError);
    });
    it('drops the group if it is empty', () => {
      const query = prepareQuery(
        {
          collectionName: 'users',
          where: [
            {
              mod: 'and',
              filters: [],
            },
            {
              mod: 'or',
              filters: [],
            },
          ],
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      );
      expect(query.where).toEqual(undefined);
    });
    it('simplifies the group if it is a single filter', () => {
      const query = prepareQuery(
        {
          collectionName: 'users',
          where: [
            {
              mod: 'and',
              filters: [['name', '=', 'test']],
            },
            {
              mod: 'or',
              filters: [['name', '=', 'test2']],
            },
          ],
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      );
      expect(query.where).toEqual([
        ['name', '=', 'test'],
        ['name', '=', 'test2'],
      ]);
    });
    // TODO: edit after removing simplifyQuery from prepareQuery
    it('keeps root OR mods and there are multiple filters, transforms subfilters', () => {
      const query = prepareQuery(
        {
          collectionName: 'users',
          where: [
            {
              mod: 'and',
              filters: [
                ['name', '=', '$global.var1'],
                ['name', '=', '$global.var2'],
              ],
            },
            {
              mod: 'or',
              filters: [
                ['name', '=', '$global.var1'],
                ['name', '=', '$global.var2'],
              ],
            },
          ],
        },
        undefined,
        {
          $global: {
            var1: 'test',
            var2: 'test2',
          },
        },
        undefined,
        {
          applyPermission: undefined,
        }
      );
      // variable replacement is a proxy for recursive preparation occuring
      expect(query.where).toEqual([
        ['name', '=', 'test'],
        ['name', '=', 'test2'],
        {
          mod: 'or',
          filters: [
            ['name', '=', 'test'],
            ['name', '=', 'test2'],
          ],
        },
      ]);
    });
  });

  describe('filter statements', () => {
    it('accepts valid filter statements', () => {
      const query = prepareQuery(
        {
          collectionName: 'users',
          where: [['name', '=', 'test']],
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      );
      expect(query.where).toEqual([['name', '=', 'test']]);
    });
    it('performs variable replacement for non relational vars', () => {
      const query = prepareQuery(
        {
          collectionName: 'users',
          where: [
            ['name', '=', '$global.var1'],
            // Unscoped vars default to relational to parent ($1)
            ['name', '=', '$unscoped'],
            ['name', '=', '$1.var2'],
          ],
        },
        undefined,
        {
          $global: {
            var1: 'test',
          },
        },
        undefined,
        {
          applyPermission: undefined,
        }
      );
      expect(query.where).toEqual([
        ['name', '=', 'test'],
        ['name', '=', '$1.unscoped'],
        ['name', '=', '$1.var2'],
      ]);
    });
    it('can opt out of static variable replacement', () => {
      const query = prepareQuery(
        {
          collectionName: 'users',
          where: [
            ['name', '=', '$global.var1'],
            // Unscoped vars default to relational to parent ($1)
            ['name', '=', '$unscoped'],
            ['name', '=', '$1.var2'],
          ],
        },
        undefined,
        {
          $global: {
            var1: 'test',
          },
        },
        undefined,
        {
          applyPermission: undefined,
          replaceStaticVariables: false,
        }
      );
      expect(query.where).toEqual([
        ['name', '=', '$global.var1'],
        ['name', '=', '$1.unscoped'],
        ['name', '=', '$1.var2'],
      ]);
    });
    it('Transforms filters with undefined variables to falsy', () => {
      const query = prepareQuery(
        {
          collectionName: 'users',
          where: [['name', '=', '$global.dne']],
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      );
      expect(query.where).toEqual([false]);
    });
    it('rejects filters to nonexistent attributes', () => {
      const schema = USER_SCHEMA;
      // prop not in schema
      expect(() =>
        prepareQuery(
          {
            collectionName: 'users',
            where: [['invalid', '=', 'test']],
          },
          schema,
          {},
          undefined,
          {
            applyPermission: undefined,
          }
        )
      ).toThrow(InvalidFilterError);
    });
    it('rejects filters with invalid operators', () => {
      const schema = USER_SCHEMA;
      // prop not in schema
      expect(() =>
        prepareQuery(
          {
            collectionName: 'users',
            where: [['name', 'has', 'test']],
          },
          schema,
          {},
          undefined,
          {
            applyPermission: undefined,
          }
        )
      ).toThrow(InvalidFilterError);
    });
    it('expands relationship paths to subqueries', () => {
      const schema = USER_PROFILE_POST_SCHEMA;
      const query = prepareQuery(
        {
          collectionName: 'posts',
          where: [['author.profile.bio', '=', 'test']],
        },
        schema,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      );
      expect(query.where).toEqual([
        {
          exists: {
            collectionName: 'users',
            where: [
              ['id', '=', '$1.authorId'],
              {
                exists: {
                  collectionName: 'profiles',
                  where: [
                    ['id', '=', '$1.profileId'],
                    ['bio', '=', 'test'],
                  ],
                },
              },
            ],
          },
        },
      ]);
    });

    it('increments relational var scopes during expansion', () => {
      const schema = USER_PROFILE_POST_SCHEMA;
      const query = prepareQuery(
        {
          collectionName: 'posts',
          // bio === post id
          where: [['author.profile.bio', '=', '$0.id']],
        },
        schema,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      );
      expect(query.where).toEqual([
        {
          exists: {
            collectionName: 'users',
            where: [
              ['id', '=', '$1.authorId'],
              {
                exists: {
                  collectionName: 'profiles',
                  where: [
                    ['id', '=', '$1.profileId'],
                    ['bio', '=', '$2.id'],
                  ],
                },
              },
            ],
          },
        },
      ]);
    });

    /**
     * Temporarily prefixing all set operations to make them unique in the query engine
     * This may be a long term solution, but it is okay to refactor the representation if needed
     */
    it('transforms Set operators to internal representation', () => {
      const schema = S.Collections({
        users: {
          schema: S.Schema({ id: S.Id(), friends: S.Set(S.String()) }),
        },
      });
      const query = prepareQuery(
        {
          collectionName: 'users',
          where: [['friends', '=', 'test']],
        },
        schema,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      );
      expect(query.where).toEqual([['friends', 'SET_=', 'test']]);
    });

    it.todo('validates and transforms value from user input to db value');
  });
  describe('relational exists filters', () => {
    it('rejects filters to nonexistent relations', () => {
      const schema = USER_PROFILE_POST_SCHEMA;
      // prop not in schema
      expect(() =>
        prepareQuery(
          {
            collectionName: 'posts',
            where: [exists('test')],
          },
          schema,
          {},
          undefined,
          {
            applyPermission: undefined,
          }
        )
      ).toThrow(InvalidFilterError);

      // prop is not a relation
      expect(() =>
        prepareQuery(
          {
            collectionName: 'posts',
            where: [exists('authorId')],
          },
          schema,
          {},
          undefined,
          {
            applyPermission: undefined,
          }
        )
      ).toThrow(InvalidFilterError);
    });
    it('transforms relationship paths to subqueries', () => {
      const schema = USER_PROFILE_POST_SCHEMA;
      const query = prepareQuery(
        {
          collectionName: 'posts',
          where: [
            exists('author.profile', {
              where: [['bio', '=', 'test']],
            }),
          ],
        },
        schema,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      );
      expect(query.where).toEqual([
        {
          exists: {
            collectionName: 'users',
            where: [
              ['id', '=', '$1.authorId'],
              {
                exists: {
                  collectionName: 'profiles',
                  where: [
                    ['id', '=', '$1.profileId'],
                    ['bio', '=', 'test'],
                  ],
                },
              },
            ],
          },
        },
      ]);
    });
    describe('$0 variable expansion', () => {
      const collections = S.Collections({
        a: {
          schema: S.Schema({
            id: S.Id(),
            aProp1: S.Number(),
            aProp2: S.Number(),
            b_id: S.String(),
            c_id: S.String(),
          }),
          relationships: {
            b: S.RelationById('b', '$1.b_id'),
            c: S.RelationById('c', '$1.c_id'),
          },
        },
        b: {
          schema: S.Schema({
            id: S.Id(),
            bProp1: S.Number(),
            bProp2: S.Number(),
          }),
        },
        c: {
          schema: S.Schema({
            id: S.Id(),
            cProp1: S.Number(),
            cProp2: S.Number(),
          }),
        },
      });

      it('expands properly with a relational different paths on prop and variable', () => {
        const query = prepareQuery(
          {
            collectionName: 'a',
            where: [['aProp1', '=', '$0.b.bProp1']],
          },
          collections,
          {},
          undefined,
          {
            applyPermission: undefined,
          }
        );
        expect(query).toEqual({
          collectionName: 'a',
          where: [
            {
              exists: {
                collectionName: 'b',
                where: [
                  ['id', '=', '$1.b_id'],
                  ['bProp1', '=', '$1.aProp1'],
                ],
              },
            },
          ],
        });
      });
      it('expands properly with a relational different paths on prop and variable', () => {
        const query = prepareQuery(
          {
            collectionName: 'a',
            where: [['b.bProp1', '=', '$0.c.cProp1']],
          },
          collections,
          {},
          undefined,
          {
            applyPermission: undefined,
          }
        );
        expect(query).toEqual({
          collectionName: 'a',
          where: [
            {
              exists: {
                collectionName: 'b',
                where: [
                  ['id', '=', '$1.b_id'],
                  {
                    exists: {
                      collectionName: 'c',
                      where: [
                        ['id', '=', '$2.c_id'],
                        ['cProp1', '=', '$1.bProp1'],
                      ],
                    },
                  },
                ],
              },
            },
          ],
        });
      });
      it('Properly flips operator of inverted statement', () => {
        const query = prepareQuery(
          {
            collectionName: 'a',
            where: [['aProp1', '>', '$0.b.bProp1']],
          },
          collections,
          {},
          undefined,
          {
            applyPermission: undefined,
          }
        );
        expect(query).toEqual({
          collectionName: 'a',
          where: [
            {
              exists: {
                collectionName: 'b',
                where: [
                  ['id', '=', '$1.b_id'],
                  ['bProp1', '<', '$1.aProp1'],
                  // still querying that aProp1 is greater
                ],
              },
            },
          ],
        });
      });
    });
    it.todo(
      'smart enough to simplify [b.bProp1, =, $0.b.prop2] query with shared relational path'
    );
  });
  describe('subquery filters', () => {
    it('prepares subquery filters', () => {
      const query = prepareQuery(
        {
          collectionName: 'users',
          where: [
            {
              exists: {
                collectionName: 'profiles',
                where: [['bio', '=', '$global.var1']],
                order: [['id', 'ASC']],
              },
            },
          ],
        },
        undefined,
        {
          $global: {
            var1: 'test',
          },
        },
        undefined,
        {
          applyPermission: undefined,
        }
      );

      expect(query.where).toEqual([
        {
          exists: {
            collectionName: 'profiles',
            where: [['bio', '=', 'test']],
            // Order clause is dropped
          },
        },
      ]);
    });
  });
});

describe('order', () => {
  it('accepts an undefined order', () => {
    const query = prepareQuery(
      { collectionName: 'users' },
      undefined,
      {},
      undefined,
      {
        applyPermission: undefined,
      }
    );
    expect(query.order).toBeUndefined();
  });
  it('accepts a valid statements array', () => {
    const query = prepareQuery(
      {
        collectionName: 'users',
        order: [
          ['name', 'ASC'],
          ['id', 'DESC'],
        ],
      },
      USER_SCHEMA,
      {},
      undefined,
      {
        applyPermission: undefined,
      }
    );
    expect(query.order).toEqual([
      ['name', 'ASC'],
      ['id', 'DESC'],
    ]);
  });
  it('rejects invalid directions', () => {
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          order: [
            ['name', 'ASC'],
            [
              'id',
              // @ts-expect-error
              'invalid',
            ],
          ],
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidOrderClauseError);
  });
  it('rejects non existent paths', () => {
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          order: [['invalid', 'ASC']],
        },
        USER_SCHEMA,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidOrderClauseError);
  });
  it('rejects non sortable path leafs', () => {
    const schema = {
      test: {
        schema: S.Schema({
          id: S.Id(),
          nested: S.Record({
            name: S.String(),
          }),
          set: S.Set(S.String(), { default: S.Default.Set.empty() }),
        }),
        relationships: {
          rel: S.RelationById('test2', '$1.id'),
        },
      },
      test2: {
        schema: S.Schema({
          id: S.Id(),
        }),
      },
    };

    // rejects records
    expect(() =>
      prepareQuery(
        { collectionName: 'test', order: [['nested', 'ASC']] },
        schema,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidOrderClauseError);

    // rejects sets
    expect(() =>
      prepareQuery(
        { collectionName: 'test', order: [['set', 'ASC']] },
        schema,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidOrderClauseError);

    // rejects relationships
    expect(() =>
      prepareQuery(
        { collectionName: 'test', order: [['rel', 'ASC']] },
        schema,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidOrderClauseError);
  });
  it('rejects "many" cardinaltiy relational paths, accepts "one" cardinality relational paths', () => {
    const schema = USER_PROFILE_POST_SCHEMA;
    expect(() =>
      prepareQuery(
        { collectionName: 'posts', order: [['author.posts.content', 'ASC']] },
        schema,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidOrderClauseError);

    const query = prepareQuery(
      { collectionName: 'posts', order: [['author.profile.bio', 'ASC']] },
      schema,
      {},
      undefined,
      {
        applyPermission: undefined,
      }
    );
    expect(query.order).toEqual([
      [
        'author.profile.bio',
        'ASC',
        {
          cardinality: 'one',
          subquery: {
            collectionName: 'users',
            include: {
              profile: {
                cardinality: 'one',
                subquery: {
                  collectionName: 'profiles',
                  where: [['id', '=', '$1.profileId']],
                },
              },
            },
            where: [['id', '=', '$1.authorId']],
          },
        },
      ],
    ]);
  });
  it('transforms relational paths to subqueries', () => {
    const schema = USER_PROFILE_POST_SCHEMA;
    const query = prepareQuery(
      {
        collectionName: 'posts',
        order: [['author.profile.bio', 'ASC']],
      },
      schema,
      {},
      undefined,
      {
        applyPermission: undefined,
      }
    );
    expect(query.order).toEqual([
      [
        'author.profile.bio',
        'ASC',
        {
          cardinality: 'one',
          subquery: {
            collectionName: 'users',
            include: {
              profile: {
                cardinality: 'one',
                subquery: {
                  collectionName: 'profiles',
                  where: [['id', '=', '$1.profileId']],
                },
              },
            },
            where: [['id', '=', '$1.authorId']],
          },
        },
      ],
    ]);
  });
});
describe('limit', () => {
  it('accepts an undefined limit', () => {
    const query = prepareQuery(
      { collectionName: 'users' },
      undefined,
      {},
      undefined,
      {
        applyPermission: undefined,
      }
    );
    expect(query.limit).toBeUndefined();
  });
  it('accepts 0 limit', () => {
    const query = prepareQuery(
      { collectionName: 'users', limit: 0 },
      undefined,
      {},
      undefined,
      {
        applyPermission: undefined,
      }
    );
    expect(query.limit).toBe(0);
  });
  it('accepts a valid number', () => {
    const query = prepareQuery(
      { collectionName: 'users', limit: 10 },
      undefined,
      {},
      undefined,
      {
        applyPermission: undefined,
      }
    );
    expect(query.limit).toBe(10);
  });
  it('rejects negative numbers', () => {
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          limit: -1,
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidQueryLimitError);
  });
  it('rejects non numbers', () => {
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          // @ts-expect-error
          limit: '10',
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidQueryLimitError);
  });
});
describe('after', () => {
  it('accepts an undefined after', () => {
    const query = prepareQuery(
      { collectionName: 'users' },
      undefined,
      {},
      undefined,
      {
        applyPermission: undefined,
      }
    );
    expect(query).toEqual({
      collectionName: 'users',
    });
  });
  it('rejects non array afters', () => {
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          // @ts-expect-error
          after: 'test',
          order: [['name', 'ASC']],
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidQueryAfterError);
  });
  it('rejects after clauses with too few elements', () => {
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          // @ts-expect-error
          after: [['test']],
          order: [['name', 'ASC']],
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidQueryAfterError);
  });
  it('rejects after clauses with too many elements', () => {
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          // @ts-expect-error
          after: [['test'], true, 'test'],
          order: [['name', 'ASC']],
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidQueryAfterError);
  });
  it('rejects non array after cursor', () => {
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          // @ts-expect-error
          after: ['test', true],
          order: [['name', 'ASC']],
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidQueryAfterError);
  });
  it('rejects queries with after but no order clause', () => {
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          after: [['test'], true],
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidQueryAfterError);
  });
  it('rejects after with too few cursor values', () => {
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          after: [['test1'], true],
          order: [
            ['attr1', 'ASC'],
            ['attr2', 'ASC'],
          ],
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidQueryAfterError);
  });
  it('rejects after with too many cursor values', () => {
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          after: [['test1', 'test2', 'test3'], true],
          order: [
            ['attr1', 'ASC'],
            ['attr2', 'ASC'],
          ],
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidQueryAfterError);
  });
  it('rejects after with invalid include flag', () => {
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          // @ts-expect-error
          after: [['test1'], 'invalid'],
          order: [['attr1', 'ASC']],
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidQueryAfterError);
  });
  it('rejects after if the order clause attr cannot be found', () => {
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          after: [['test1'], true],
          order: [['invalid', 'ASC']],
        },
        USER_SCHEMA,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(
      // Throws in order clause validation, but keep this just in case
      InvalidOrderClauseError
    );
  });
  it('rejects after if the order clause attr cannot be sorted', () => {
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          after: [['test1'], true],
          // set type not sortable
          order: [['emails', 'ASC']],
        },
        USER_PROFILE_SCHEMA,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(
      // Throws in order clause validation, but keep this just in case
      InvalidOrderClauseError
    );
  });
  it('rejects after if the order clause attr is relational', () => {
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          after: [['test1'], true],
          // query type not sortable
          order: [['profile.bio', 'ASC']],
        },
        USER_PROFILE_SCHEMA,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidQueryAfterError);
  });
  it('accepts valid after clauses', () => {
    const query = prepareQuery(
      {
        collectionName: 'users',
        after: [['test1', 2, true, null], true],
        order: [
          ['attr1', 'ASC'],
          ['attr2', 'ASC'],
          ['attr3', 'ASC'],
          ['attr4', 'ASC'],
        ],
      },
      undefined,
      {},
      undefined,
      {
        applyPermission: undefined,
      }
    );
    expect(query).toEqual({
      collectionName: 'users',
      after: [['test1', 2, true, null], true],
      order: [
        ['attr1', 'ASC'],
        ['attr2', 'ASC'],
        ['attr3', 'ASC'],
        ['attr4', 'ASC'],
      ],
    });
  });
  it('applies default schemaless conversions to after cursor values', () => {
    const date = new Date('12-12-2024');
    const stringifiedDate = date.toISOString();
    const query = prepareQuery(
      {
        collectionName: 'users',
        after: [[date], true],
        order: [['attr1', 'ASC']],
      },
      undefined,
      {},
      undefined,
      {
        applyPermission: undefined,
      }
    );
    expect(query).toEqual({
      collectionName: 'users',
      after: [[stringifiedDate], true],
      order: [['attr1', 'ASC']],
    });
  });
  it('rejects after cursor values that cannot be converted by schema', () => {
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          after: [[2], true],
          order: [['name', 'ASC']],
        },
        USER_SCHEMA,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidQueryAfterError);
  });
  // TODO: eventaully we probably want to accept this as the same as null
  it('TEMPORARY: rejects undefined after cursor values', () => {
    expect(() =>
      prepareQuery(
        {
          collectionName: 'users',
          after: [
            [
              // @ts-expect-error
              undefined,
            ],
            true,
          ],
          order: [['name', 'ASC']],
        },
        undefined,
        {},
        undefined,
        {
          applyPermission: undefined,
        }
      )
    ).toThrow(InvalidQueryAfterError);
  });
  it.todo('applies input conversions if schema is provided', () => {
    // TODO: we dont have a great type to test conversions because our main candidate 'date' is applied to all
    // Also should revisit conversion code of types in general
  });
});

import { describe, expect, it } from 'vitest';
import { validateSchema } from '../src/schema/validation.js';
import { Schema as S } from '../src/schema/builder.js';

it('schema must be defined', () => {
  expect(validateSchema(undefined)).toBe('schema is not defined');
});

it('schema must be object', () => {
  expect(validateSchema(1)).toBe('schema is not an object');
});

describe('roles validation', () => {
  it('roles is optional', () => {
    expect(
      validateSchema({
        collections: {
          test: {
            schema: S.Schema({
              id: S.Id(),
            }),
          },
        },
      })
    ).toBe(undefined);
  });
  it('roles must be an object', () => {
    expect(
      validateSchema({
        roles: 1,
        collections: {
          test: {
            schema: S.Schema({
              id: S.Id(),
            }),
          },
        },
      })
    ).toBe('schema roles definition is invalid: roles is not an object');
  });
  describe('role name validation', () => {
    it('role names must have length', () => {
      expect(
        validateSchema({
          roles: { '': {} },
          collections: {
            test: {
              schema: S.Schema({
                id: S.Id(),
              }),
            },
          },
        })
      ).toBe(
        'schema roles definition is invalid: role "" is invalid: role name is empty'
      );
    });
    it('role names cannot start with underscore', () => {
      expect(
        validateSchema({
          roles: { _test: {} },
          collections: {
            test: {
              schema: S.Schema({
                id: S.Id(),
              }),
            },
          },
        })
      ).toBe(
        'schema roles definition is invalid: role "_test" is invalid: role name cannot start with an underscore'
      );
    });
    it('role names cannot start with number', () => {
      expect(
        validateSchema({
          roles: { '1test': {} },
          collections: {
            test: {
              schema: S.Schema({
                id: S.Id(),
              }),
            },
          },
        })
      ).toBe(
        'schema roles definition is invalid: role "1test" is invalid: role name cannot start with a numeric character'
      );
    });
    it('role names cannot contain invalid characters', () => {
      expect(
        validateSchema({
          roles: { test$: {} },
          collections: {
            test: {
              schema: S.Schema({
                id: S.Id(),
              }),
            },
          },
        })
      ).toBe(
        'schema roles definition is invalid: role "test$" is invalid: role name contains invalid characters - only alphanumeric characters and underscores are allowed.'
      );
    });
    it('allows subsequent alphanumeric and underscore characters', () => {
      expect(
        validateSchema({
          roles: {
            test_1: {
              match: {
                uid: '$userId',
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
        })
      ).toBe(undefined);
    });
  });
  describe('role validation', () => {
    it('role must be defined', () => {
      expect(
        validateSchema({
          roles: { test: undefined },
          collections: {
            test: {
              schema: S.Schema({
                id: S.Id(),
              }),
            },
          },
        })
      ).toBe(
        'schema roles definition is invalid: role "test" is invalid: role is not defined'
      );
    });
    it('role must be object', () => {
      expect(
        validateSchema({
          roles: { test: 1 },
          collections: {
            test: {
              schema: S.Schema({
                id: S.Id(),
              }),
            },
          },
        })
      ).toBe(
        'schema roles definition is invalid: role "test" is invalid: role is not an object'
      );
    });
    it('role must have matcher', () => {
      expect(
        validateSchema({
          roles: { test: {} },
          collections: {
            test: {
              schema: S.Schema({
                id: S.Id(),
              }),
            },
          },
        })
      ).toBe(
        'schema roles definition is invalid: role "test" is invalid: matcher is not defined'
      );
    });
    it('role matcher must be string', () => {
      expect(
        validateSchema({
          roles: { test: { match: 1 } },
          collections: {
            test: {
              schema: S.Schema({
                id: S.Id(),
              }),
            },
          },
        })
      ).toBe(
        'schema roles definition is invalid: role "test" is invalid: matcher is not an object'
      );
    });
  });
});

describe('collections validation', () => {
  it('collections must be defined', () => {
    expect(validateSchema({})).toBe(
      'schema collections definition is invalid: collections is not defined'
    );
    expect(validateSchema({ collections: undefined })).toBe(
      'schema collections definition is invalid: collections is not defined'
    );
  });
  it('collections must be object', () => {
    expect(validateSchema({ collections: 1 })).toBe(
      'schema collections definition is invalid: collections is not an object'
    );
  });

  describe('collection name validation', () => {
    it('collection name must have length', () => {
      expect(validateSchema({ collections: { '': {} } })).toBe(
        'schema collections definition is invalid: "" is not a valid collection name: collection name is empty'
      );
    });
    it('collection name cannot start with underscore', () => {
      expect(validateSchema({ collections: { _test: {} } })).toBe(
        'schema collections definition is invalid: "_test" is not a valid collection name: collection name cannot start with an underscore'
      );
    });
    it('collection name cannot start with number', () => {
      expect(validateSchema({ collections: { '1test': {} } })).toBe(
        'schema collections definition is invalid: "1test" is not a valid collection name: collection name cannot start with a numeric character'
      );
    });
    it('collection name cannot contain invalid characters', () => {
      expect(validateSchema({ collections: { test$: {} } })).toBe(
        'schema collections definition is invalid: "test$" is not a valid collection name: collection name contains invalid characters - only alphanumeric characters and underscores are allowed.'
      );
    });
    it('allows subsequent alphanumeric and underscore characters', () => {
      expect(
        validateSchema({
          collections: {
            test_1: {
              schema: S.Schema({
                id: S.Id(),
              }),
            },
          },
        })
      ).toBe(undefined);
    });
  });
  describe('collection validation', () => {
    it('collection must be defined', () => {
      expect(validateSchema({ collections: { test: undefined } })).toBe(
        'schema collections definition is invalid: "test" is not a valid collection: collection is not defined'
      );
    });
    it('collection must be object', () => {
      expect(validateSchema({ collections: { test: 1 } })).toBe(
        'schema collections definition is invalid: "test" is not a valid collection: collection is not an object'
      );
    });

    describe('collection schema validation', () => {
      it('collection must have schema', () => {
        expect(validateSchema({ collections: { test: {} } })).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: schema is not defined'
        );
        expect(
          validateSchema({ collections: { test: { schema: undefined } } })
        ).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: schema is not defined'
        );
      });
      it('collection schema must be object', () => {
        expect(validateSchema({ collections: { test: { schema: 1 } } })).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: schema is not an object'
        );
      });
      it('colleciton schema must be a valid record type', () => {
        expect(
          validateSchema({
            collections: { test: { schema: S.String() } },
          })
        ).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: not a record type'
        );
      });
      it('colleciton schema must have an id property', () => {
        expect(
          validateSchema({
            collections: {
              test: {
                schema: S.Schema({
                  name: S.String(),
                }),
              },
            },
          })
        ).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: primary key field "id" is not defined'
        );
      });
      it('colleciton schema must have valid property names', () => {
        expect(
          validateSchema({
            collections: {
              test: {
                schema: S.Schema({
                  id: S.Id(),
                  '': S.String(),
                }),
              },
            },
          })
        ).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: type record property "" is invalid: property name is empty'
        );
        expect(
          validateSchema({
            collections: {
              test: {
                schema: S.Schema({
                  id: S.Id(),
                  '1name': S.String(),
                }),
              },
            },
          })
        ).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: type record property "1name" is invalid: property name cannot start with a numeric character'
        );
        expect(
          validateSchema({
            collections: {
              test: {
                schema: S.Schema({
                  id: S.Id(),
                  name$: S.String(),
                }),
              },
            },
          })
        ).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: type record property "name$" is invalid: property name contains invalid characters - only alphanumeric characters and underscores are allowed.'
        );
      });
      it('collection schema must have valid property definitions', () => {
        expect(
          validateSchema({
            collections: {
              test: {
                schema: S.Schema({
                  id: S.Id(),
                  name: 'alice',
                }),
              },
            },
          })
        ).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: type record property "name" is invalid: type is not a DataType'
        );
        expect(
          validateSchema({
            collections: {
              test: {
                schema: S.Schema({
                  id: S.Id(),
                  name: S.RelationById('names', '$id'),
                }),
              },
            },
          })
        ).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: type record property "name" is invalid: type "undefined" is not recognized'
        );
      });
    });

    describe('collection relationships validation', () => {
      it('relationships is optional', () => {
        expect(
          validateSchema({
            collections: {
              test: {
                schema: S.Schema({
                  id: S.Id(),
                }),
              },
            },
          })
        ).toBe(undefined);
      });
      it('relationships must be object', () => {
        expect(
          validateSchema({
            collections: {
              test: {
                schema: S.Schema({
                  id: S.Id(),
                }),
                relationships: 1,
              },
            },
          })
        ).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection relationships is invalid: relationships is not an object'
        );
      });
      it('relationship names cannot be empty', () => {
        expect(
          validateSchema({
            collections: {
              test: {
                schema: S.Schema({
                  id: S.Id(),
                }),
                relationships: {
                  '': {},
                },
              },
            },
          })
        ).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection relationships is invalid: relationship "" is invalid: relationship name is empty'
        );
      });
      it('relationship names cannot start with underscore', () => {
        expect(
          validateSchema({
            collections: {
              test: {
                schema: S.Schema({
                  id: S.Id(),
                }),
                relationships: {
                  _test: {},
                },
              },
            },
          })
        ).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection relationships is invalid: relationship "_test" is invalid: relationship name cannot start with an underscore'
        );
      });
      it('relationship names cannot start with number', () => {
        expect(
          validateSchema({
            collections: {
              test: {
                schema: S.Schema({
                  id: S.Id(),
                }),
                relationships: {
                  '1test': {},
                },
              },
            },
          })
        ).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection relationships is invalid: relationship "1test" is invalid: relationship name cannot start with a numeric character'
        );
      });
      it('relationship names cannot contain invalid characters', () => {
        expect(
          validateSchema({
            collections: {
              test: {
                schema: S.Schema({
                  id: S.Id(),
                }),
                relationships: {
                  test$: {},
                },
              },
            },
          })
        ).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection relationships is invalid: relationship "test$" is invalid: relationship name contains invalid characters - only alphanumeric characters and underscores are allowed.'
        );
      });
      it('allows subsequent alphanumeric and underscore characters', () => {
        expect(
          validateSchema({
            collections: {
              test_1: {
                schema: S.Schema({
                  id: S.Id(),
                }),
                relationships: {
                  test_2: S.RelationById('users', '$id'),
                },
              },
              users: {
                schema: S.Schema({
                  id: S.Id(),
                }),
              },
            },
          })
        ).toBe(undefined);
      });
      it('relationships must have a cardinality', () => {
        expect(
          validateSchema({
            collections: {
              test: {
                schema: S.Schema({
                  id: S.Id(),
                }),
                relationships: {
                  test: {
                    query: { collectionName: 'test' },
                  },
                },
              },
            },
          })
        ).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection relationships is invalid: relationship "test" is invalid: cardinality is not defined'
        );
        expect(
          validateSchema({
            collections: {
              test: {
                schema: S.Schema({
                  id: S.Id(),
                }),
                relationships: {
                  test: {
                    query: { collectionName: 'test', cardinality: undefined },
                  },
                },
              },
            },
          })
        ).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection relationships is invalid: relationship "test" is invalid: cardinality is not defined'
        );
      });
      it('relationships must have a valid cardinality', () => {
        expect(
          validateSchema({
            collections: {
              test: {
                schema: S.Schema({
                  id: S.Id(),
                }),
                relationships: {
                  test: {
                    cardinality: 'invalid',
                    query: { collectionName: 'test' },
                  },
                },
              },
            },
          })
        ).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection relationships is invalid: relationship "test" is invalid: cardinality is invalid'
        );
      });
      it('relationships must have a query', () => {
        expect(
          validateSchema({
            collections: {
              test: {
                schema: S.Schema({
                  id: S.Id(),
                }),
                relationships: {
                  test: {
                    cardinality: 'one',
                  },
                },
              },
            },
          })
        ).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection relationships is invalid: relationship "test" is invalid: query is not defined'
        );
        expect(
          validateSchema({
            collections: {
              test: {
                schema: S.Schema({
                  id: S.Id(),
                }),
                relationships: {
                  test: {
                    cardinality: 'one',
                    query: undefined,
                  },
                },
              },
            },
          })
        ).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection relationships is invalid: relationship "test" is invalid: query is not defined'
        );
      });
      it('relationship query must be object', () => {
        expect(
          validateSchema({
            collections: {
              test: {
                schema: S.Schema({
                  id: S.Id(),
                }),
                relationships: {
                  test: {
                    cardinality: 'one',
                    query: 1,
                  },
                },
              },
            },
          })
        ).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection relationships is invalid: relationship "test" is invalid: query is not an object'
        );
      });
    });
    describe('collection permissions validation', () => {
      it('permissions is optional', () => {
        expect(
          validateSchema({
            collections: {
              test: {
                schema: S.Schema({
                  id: S.Id(),
                }),
              },
            },
          })
        ).toBe(undefined);
      });
      it('permissions must be object', () => {
        expect(
          validateSchema({
            collections: {
              test: {
                schema: S.Schema({
                  id: S.Id(),
                }),
                permissions: 1,
              },
            },
          })
        ).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection permissions is invalid: permissions is not an object'
        );
      });
      it.skip('permission keys must match a role', () => {
        expect(
          validateSchema({
            collections: {
              test: {
                schema: S.Schema({
                  id: S.Id(),
                }),
                permissions: {
                  test: {},
                },
              },
            },
            roles: {
              admin: {
                match: {
                  uid: '$userId',
                },
              },
            },
          })
        ).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection permissions is invalid: "test" does not match a role'
        );
      });
      it('role permissions must be an object', () => {
        expect(
          validateSchema({
            collections: {
              test: {
                schema: S.Schema({
                  id: S.Id(),
                }),
                permissions: {
                  admin: 1,
                },
              },
            },
            roles: {
              admin: {
                match: {
                  uid: '$userId',
                },
              },
            },
          })
        ).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection permissions is invalid: permissions for role "admin" is invalid: not an object'
        );
      });
      it('permission definitions must be an object', () => {
        expect(
          validateSchema({
            collections: {
              test: {
                schema: S.Schema({
                  id: S.Id(),
                }),
                permissions: {
                  admin: {
                    read: 1,
                  },
                },
              },
            },
            roles: {
              admin: {
                match: {
                  uid: '$userId',
                },
              },
            },
          })
        ).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection permissions is invalid: permissions for role "admin" is invalid: "read" permission is invalid: permission is not an object'
        );
      });
    });
  });
});

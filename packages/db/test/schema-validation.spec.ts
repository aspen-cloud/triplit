import { describe, expect, it } from 'vitest';
import { validateSchema } from '../src/schema/validation.js';
import { Schema as S } from '../src/schema/builder.js';
import { ALL_TYPES } from '../src/index.js';

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
      it('collection schema must be a valid record type', () => {
        expect(
          validateSchema({
            collections: { test: { schema: S.String() } },
          })
        ).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: not a record type'
        );
      });
      it('collection schema must have an id property', () => {
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
      it('collection schema must have valid property names', () => {
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

      describe('data type validation', () => {
        it('collection schema must have valid property definitions', () => {
          expect(
            validateSchema({
              collections: {
                test: {
                  schema: S.Schema({
                    id: S.Id(),
                    name: undefined,
                  }),
                },
              },
            })
          ).toBe(
            'schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: type record property "name" is invalid: type is not defined'
          );
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

        describe.each(ALL_TYPES)('%s base checks', (type) => {
          it('type must have valid config if provided', () => {
            expect(
              validateSchema({
                collections: {
                  test: {
                    schema: S.Schema({
                      id: S.Id(),
                      name: {
                        type: type,
                        config: 1,
                      },
                    }),
                  },
                },
              })
            ).toBe(
              `schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: type record property "name" is invalid: type ${type} is invalid: type config is not an object`
            );
          });
          it('nullable must be boolean if provided', () => {
            expect(
              validateSchema({
                collections: {
                  test: {
                    schema: S.Schema({
                      id: S.Id(),
                      name: {
                        type: type,
                        config: {
                          nullable: 1,
                        },
                      },
                    }),
                  },
                },
              })
            ).toBe(
              `schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: type record property "name" is invalid: type ${type} is invalid: option nullable is invalid`
            );
          });
          it('optional must be boolean if provided', () => {
            expect(
              validateSchema({
                collections: {
                  test: {
                    schema: S.Schema({
                      id: S.Id(),
                      name: {
                        type: type,
                        config: {
                          optional: 1,
                        },
                      },
                    }),
                  },
                },
              })
            ).toBe(
              `schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: type record property "name" is invalid: type ${type} is invalid: option optional is invalid`
            );
          });
        });

        describe('additional boolean checks', () => {
          it('default value must be a boolean', () => {
            expect(
              validateSchema({
                collections: {
                  test: {
                    schema: S.Schema({
                      id: S.Id(),
                      name: S.Boolean({
                        default: 1,
                      }),
                    }),
                  },
                },
              })
            ).toBe(
              'schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: type record property "name" is invalid: type boolean is invalid: option default is invalid: default value could not be serialized to type'
            );
            expect(
              validateSchema({
                collections: {
                  test: {
                    schema: S.Schema({
                      id: S.Id(),
                      name: S.Boolean({
                        default: false,
                      }),
                    }),
                  },
                },
              })
            ).toBe(undefined);
          });
        });
        describe('additional date checks', () => {
          it('default value must be a date encodable', () => {
            expect(
              validateSchema({
                collections: {
                  test: {
                    schema: S.Schema({
                      id: S.Id(),
                      name: S.Date({
                        default: true,
                      }),
                    }),
                  },
                },
              })
            ).toBe(
              'schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: type record property "name" is invalid: type date is invalid: option default is invalid: default value could not be serialized to type'
            );
            expect(
              validateSchema({
                collections: {
                  test: {
                    schema: S.Schema({
                      id: S.Id(),
                      name: S.Date({
                        // TODO: test new Date()
                        default: new Date().toISOString(),
                      }),
                    }),
                  },
                },
              })
            ).toBe(undefined);
          });
        });
        describe('additional json checks', () => {
          it('default value must be a json encodable', () => {
            // TODO: test with a non-serializable value
            // expect(
            //   validateSchema({
            //     collections: {
            //       test: {
            //         schema: S.Schema({
            //           id: S.Id(),
            //           name: S.Json({
            //             default: ,
            //           }),
            //         }),
            //       },
            //     },
            //   })
            // ).toBe(
            //   'schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: type record property "name" is invalid: type json is invalid: option default is invalid: default value could not be serialized to type'
            // );
            expect(
              validateSchema({
                collections: {
                  test: {
                    schema: S.Schema({
                      id: S.Id(),
                      name: S.Json({
                        default: { test: 1 },
                      }),
                    }),
                  },
                },
              })
            ).toBe(undefined);
          });
        });
        describe('additional number checks', () => {
          it('default value must be a number', () => {
            expect(
              validateSchema({
                collections: {
                  test: {
                    schema: S.Schema({
                      id: S.Id(),
                      name: S.Number({
                        default: '1',
                      }),
                    }),
                  },
                },
              })
            ).toBe(
              'schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: type record property "name" is invalid: type number is invalid: option default is invalid: default value could not be serialized to type'
            );
            expect(
              validateSchema({
                collections: {
                  test: {
                    schema: S.Schema({
                      id: S.Id(),
                      name: S.Number({
                        default: 1,
                      }),
                    }),
                  },
                },
              })
            ).toBe(undefined);
          });
        });
        describe('additional record checks', () => {
          it('record types cannot set a default value', () => {
            const recordType = S.Record({
              attr: S.String(),
            });
            recordType.config.default = { attr: 'foo' };
            expect(
              validateSchema({
                collections: {
                  test: {
                    schema: S.Schema({
                      id: S.Id(),
                      name: recordType,
                    }),
                  },
                },
              })
            ).toBe(
              'schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: type record property "name" is invalid: type record is invalid: option default is invalid: default value cannot be set for record types'
            );
          });
          // Record type checks === schema type checks tested above
        });
        describe('additional set checks', () => {
          it('default value must be a set encodable', () => {
            expect(
              validateSchema({
                collections: {
                  test: {
                    schema: S.Schema({
                      id: S.Id(),
                      name: S.Set(S.String(), {
                        default: 1,
                      }),
                    }),
                  },
                },
              })
            ).toBe(
              'schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: type record property "name" is invalid: type set is invalid: option default is invalid: default value could not be serialized to type'
            );
            expect(
              validateSchema({
                collections: {
                  test: {
                    schema: S.Schema({
                      id: S.Id(),
                      name: S.Set(S.String(), {
                        default: ['foo'],
                      }),
                    }),
                  },
                },
              })
            ).toBe(undefined);
          });
          it('set type must have items property', () => {
            const setType = S.Set(S.String());
            setType.items = undefined;
            expect(
              validateSchema({
                collections: {
                  test: {
                    schema: S.Schema({
                      id: S.Id(),
                      name: setType,
                    }),
                  },
                },
              })
            ).toBe(
              'schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: type record property "name" is invalid: type set is missing items'
            );
            expect(
              validateSchema({
                collections: {
                  test: {
                    schema: S.Schema({
                      id: S.Id(),
                      name: S.Set(S.String()),
                    }),
                  },
                },
              })
            ).toBe(undefined);
          });
          it('set type items must be valid primitive type', () => {
            expect(
              validateSchema({
                collections: {
                  test: {
                    schema: S.Schema({
                      id: S.Id(),
                      name: S.Set(S.String({ nullable: 'foo' })),
                    }),
                  },
                },
              })
            ).toBe(
              'schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: type record property "name" is invalid: type set items is invalid: type string is invalid: option nullable is invalid'
            );

            expect(
              validateSchema({
                collections: {
                  test: {
                    schema: S.Schema({
                      id: S.Id(),
                      name: S.Set(S.Record({ attr: S.String() })),
                    }),
                  },
                },
              })
            ).toBe(
              'schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: type record property "name" is invalid: type set items must be a primitive type'
            );
          });
        });
        describe('additional string checks', () => {
          it('enum must be an array of strings if provided', () => {
            expect(
              validateSchema({
                collections: {
                  test: {
                    schema: S.Schema({
                      id: S.Id(),
                      name: S.String({
                        enum: 1,
                      }),
                    }),
                  },
                },
              })
            ).toBe(
              'schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: type record property "name" is invalid: type string enum is not an array'
            );
            expect(
              validateSchema({
                collections: {
                  test: {
                    schema: S.Schema({
                      id: S.Id(),
                      name: S.String({
                        enum: ['foo', 1],
                      }),
                    }),
                  },
                },
              })
            ).toBe(
              'schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: type record property "name" is invalid: type string enum value is not a string'
            );
            expect(
              validateSchema({
                collections: {
                  test: {
                    schema: S.Schema({
                      id: S.Id(),
                      name: S.String({
                        enum: ['foo', 'bar'],
                      }),
                    }),
                  },
                },
              })
            ).toBe(undefined);
          });
          it('default value must be in enum if provided', () => {
            expect(
              validateSchema({
                collections: {
                  test: {
                    schema: S.Schema({
                      id: S.Id(),
                      name: S.String({
                        enum: ['foo', 'bar'],
                        default: 'baz',
                      }),
                    }),
                  },
                },
              })
            ).toBe(
              'schema collections definition is invalid: "test" is not a valid collection: collection schema is invalid: type record property "name" is invalid: type string is invalid: option default is invalid: default value could not be serialized to type'
            );
            expect(
              validateSchema({
                collections: {
                  test: {
                    schema: S.Schema({
                      id: S.Id(),
                      name: S.String({
                        enum: ['foo', 'bar'],
                        default: 'foo',
                      }),
                    }),
                  },
                },
              })
            ).toBe(undefined);
          });
        });
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
      it('relationship names cannot match a property in the schema', () => {
        expect(
          validateSchema({
            collections: {
              test: {
                schema: S.Schema({
                  id: S.Id(),
                  attr: S.String(),
                }),
                relationships: {
                  attr: S.RelationById('users', '$id'),
                },
              },
            },
          })
        ).toBe(
          'schema collections definition is invalid: "test" is not a valid collection: collection relationships is invalid: relationship "attr" is invalid: relationship name matches a property name'
        );
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

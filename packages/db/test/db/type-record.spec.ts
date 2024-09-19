import { describe, expect, it } from 'vitest';
import {
  DB,
  Schema as S,
  DBSerializationError,
  InvalidOperationError,
} from '../../src';

describe('record operations', () => {
  it('schemaless: can insert an empty record', async () => {
    const db = new DB();
    await db.insert('test', {
      id: 'item1',
      shallow: {},
      deep: {
        deeper: {
          deepest: {},
        },
      },
      value: 'test',
    });
    const result = await db.fetchById('test', 'item1');
    expect(result.shallow).toEqual({});
    expect(result.deep.deeper.deepest).toEqual({});
  });

  const defaultRecord = {
    id: 'alice',
    data: {
      firstName: 'Alice',
      lastName: 'Smith',
      address: {
        street: '123 Main St',
        city: 'San Francisco',
      },
    },
  };

  it('schemaless: can update a record to empty', async () => {
    const db = new DB();
    await db.insert('test', defaultRecord);
    await db.update('test', 'alice', async (entity) => {
      entity.data.address = {};
      expect(entity.data).toEqual({
        firstName: 'Alice',
        lastName: 'Smith',
        address: {},
      });
    });
    const result = await db.fetchById('test', 'alice');
    expect(result.data).toEqual({
      firstName: 'Alice',
      lastName: 'Smith',
      address: {},
    });
  });

  it('schemaless: can assign a record to a new attribute', async () => {
    const db = new DB();
    await db.insert('test', defaultRecord);
    await db.update('test', 'alice', async (entity) => {
      entity.data.test = {
        att1: 'val1',
      };
      expect(entity.data.test).toEqual({
        att1: 'val1',
      });
    });
    const result = await db.fetchById('test', 'alice');
    expect(result.data).toEqual({
      ...defaultRecord.data,
      test: {
        att1: 'val1',
      },
    });
  });

  it('schemaless: can assign values', async () => {
    const db = new DB();
    await db.insert('test', defaultRecord);
    await db.update('test', 'alice', async (entity) => {
      entity.data.address = 'val1';
      expect(entity.data.address).toEqual('val1');
    });
    const result = await db.fetchById('test', 'alice');
    expect(result.data).toEqual({
      ...defaultRecord.data,
      address: 'val1',
    });
  });
  it('schemaless: can assign null', async () => {
    const db = new DB();
    await db.insert('test', defaultRecord);
    await db.update('test', 'alice', async (entity) => {
      entity.data.address = null;
      expect(entity.data.address).toEqual(null);
    });
    const result = await db.fetchById('test', 'alice');
    expect(result.data).toEqual({
      ...defaultRecord.data,
      address: null,
    });
  });
  it('schemaless: can assign another record', async () => {
    const db = new DB();
    await db.insert('test', defaultRecord);
    await db.update('test', 'alice', async (entity) => {
      entity.data.address = {
        att1: 'val1',
        attr2: {
          att3: 'val3',
        },
      };
      expect(entity.data.address).toEqual({
        att1: 'val1',
        attr2: {
          att3: 'val3',
        },
      });
    });
    const result = await db.fetchById('test', 'alice');
    expect(result.data).toEqual({
      ...defaultRecord.data,
      address: {
        att1: 'val1',
        attr2: {
          att3: 'val3',
        },
      },
    });
  });
  it('schemaless: can delete properties', async () => {
    const db = new DB();
    await db.insert('test', defaultRecord);
    await db.update('test', 'alice', async (entity) => {
      delete entity.data.firstName;
      delete entity.data.address.city;
      expect(entity.data).toEqual({
        lastName: 'Smith',
        address: {
          street: '123 Main St',
        },
      });
    });
    {
      const result = await db.fetchById('test', 'alice');
      expect(result.data).toEqual({
        lastName: 'Smith',
        address: {
          street: '123 Main St',
        },
      });
    }
    await db.update('test', 'alice', async (entity) => {
      delete entity.data.lastName;
      delete entity.data.address;
      expect(entity.data).toEqual({});
    });
    {
      const result = await db.fetchById('test', 'alice');
      expect(result.data).toEqual({});
    }
  });

  it('schemaless: can delete deep properties', async () => {
    const db = new DB();
    await db.insert('test', {
      id: 'alice',
      data: {
        firstName: 'Alice',
        lastName: 'Smith',
        deep: {
          deeper: {
            deepest: {
              address: {
                street: '123 Main St',
                city: 'San Francisco',
              },
            },
          },
        },
      },
    });
    await db.update('test', 'alice', async (entity) => {
      delete entity.data.deep;
      expect(entity.data).toEqual({
        firstName: 'Alice',
        lastName: 'Smith',
      });
    });
    const result = await db.fetchById('test', 'alice');
    expect(result.data).toEqual({
      firstName: 'Alice',
      lastName: 'Smith',
    });
  });

  const schema = {
    collections: {
      test: {
        schema: S.Schema({
          id: S.Id(),
          data: S.Record({
            firstName: S.String(),
            lastName: S.String(),
            address: S.Record({
              street: S.String(),
              city: S.String(),
            }),
          }),
        }),
      },
    },
  };

  it('schemaful: can insert an empty record', async () => {
    const db = new DB({
      schema: {
        collections: {
          test: {
            schema: S.Schema({
              id: S.Id(),
              shallow: S.Record({}),
              deep: S.Record({
                deeper: S.Record({
                  deepest: S.Record({}),
                }),
              }),
              value: S.String(),
            }),
          },
        },
      },
    });
    await db.insert('test', {
      id: 'item1',
      shallow: {},
      deep: {
        deeper: {
          deepest: {},
        },
      },
      value: 'test',
    });
    const result = await db.fetchById('test', 'item1');
    expect(result.shallow).toEqual({});
    expect(result.deep.deeper.deepest).toEqual({});
  });

  it('schemaful: can update a record', async () => {
    const db = new DB({
      schema,
    });
    await db.insert('test', defaultRecord);
    await db.update('test', 'alice', async (entity) => {
      entity.data = {
        ...entity.data,
        address: {
          city: 'New York',
          street: '123 Main St',
        },
      };
      expect(entity.data).toEqual({
        firstName: 'Alice',
        lastName: 'Smith',
        address: {
          street: '123 Main St',
          city: 'New York',
        },
      });
    });
    const result = await db.fetchById('test', 'alice');
    expect(result.data).toEqual({
      firstName: 'Alice',
      lastName: 'Smith',
      address: {
        street: '123 Main St',
        city: 'New York',
      },
    });
  });

  it('schemaful: cannot update a record to include a new property', async () => {
    const db = new DB({
      schema,
    });
    await db.insert('test', defaultRecord);
    await expect(
      db.update('test', 'alice', async (entity) => {
        entity.data = {
          ...entity.data,
          address: {
            city: 'New York',
            street: '123 Main St',
            foo: 'bar',
          },
        };
      })
    ).rejects.toThrowError(DBSerializationError);
  });

  it('schemaful: cannot update a record with an invalid property', async () => {
    const db = new DB({
      schema,
    });
    await db.insert('test', defaultRecord);
    await expect(
      db.update('test', 'alice', async (entity) => {
        entity.data = {
          ...entity.data,
          address: {
            city: 'New York',
            street: 123,
          },
        };
      })
    ).rejects.toThrowError(DBSerializationError);
  });

  it('schemaful: deleting an attiribute throws an error', async () => {
    const db = new DB({
      schema,
    });
    await db.insert('test', defaultRecord);
    await expect(
      db.update('test', 'alice', async (entity) => {
        delete entity.data.firstName;
      })
    ).rejects.toThrowError(InvalidOperationError);
  });

  it('schemaful: cannot assign a non record', async () => {
    const db = new DB({
      schema,
    });
    await db.insert('test', defaultRecord);
    // TODO: this waits for triple validation to freak out, not sure if we should do it sooner
    await expect(
      db.update('test', 'alice', async (entity) => {
        entity.data = 123;
      })
    ).rejects.toThrowError();
  });

  describe('optional properties', async () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({
            id: S.Id(),
            optionalAttr: S.Optional(S.String()),
            record: S.Record({
              attr: S.String(),
              optionalAttr: S.Optional(S.String()),
            }),
          }),
        },
      },
    };

    it('can insert optional properties', async () => {
      const db = new DB({
        schema,
      });
      await db.insert('test', {
        id: 'item1',
        record: {
          attr: 'attr',
        },
      });
      {
        const result = await db.fetchById('test', 'item1');
        expect(result).toEqual({
          id: 'item1',
          record: {
            attr: 'attr',
          },
        });
      }
      await db.insert('test', {
        id: 'item2',
        optionalAttr: undefined,
        record: {
          attr: 'attr',
          optionalAttr: undefined,
        },
      });
      {
        const result = await db.fetchById('test', 'item1');
        expect(result).toEqual({
          id: 'item1',
          record: {
            attr: 'attr',
          },
        });
      }
    });

    it('can update optional properties', async () => {
      const db = new DB({
        schema,
      });
      await db.insert('test', {
        id: 'item1',
        record: {
          attr: 'attr',
        },
      });
      await db.update('test', 'item1', async (entity) => {
        entity.optionalAttr = 'optional';
        entity.record.optionalAttr = 'optional';
      });
      {
        const result = await db.fetchById('test', 'item1');
        expect(result).toEqual({
          id: 'item1',
          optionalAttr: 'optional',
          record: {
            attr: 'attr',
            optionalAttr: 'optional',
          },
        });
      }
      await db.update('test', 'item1', async (entity) => {
        entity.optionalAttr = undefined;
        entity.record.optionalAttr = undefined;
      });
      {
        const result = await db.fetchById('test', 'item1');
        expect(result).toEqual({
          id: 'item1',
          record: {
            attr: 'attr',
          },
        });
      }
    });

    it('can delete optional properties', async () => {
      const db = new DB({
        schema,
      });
      await db.insert('test', {
        id: 'item1',
        record: {
          attr: 'attr',
          optionalAttr: 'optional',
        },
      });
      await db.update('test', 'item1', async (entity) => {
        delete entity.optionalAttr;
        delete entity.record.optionalAttr;
      });
      const result = await db.fetchById('test', 'item1');
      expect(result).toEqual({
        id: 'item1',
        record: {
          attr: 'attr',
        },
      });
    });

    it('can select optional types without values', async () => {
      const db = new DB({
        schema,
      });
      await db.insert('test', {
        id: 'item1',
        record: {
          attr: 'attr',
        },
      });
      {
        const result = await db.fetch(
          db.query('test').select(['optionalAttr', 'id']).build()
        );
        console.log(result);
        expect(result.find((e) => e.id === 'item1')).toEqual({ id: 'item1' });
      }
      {
        const result = await db.fetch(
          db.query('test').select(['optionalAttr', 'record', 'id']).build()
        );
        expect(result.find((e) => e.id === 'item1')).toEqual({
          id: 'item1',
          record: {
            attr: 'attr',
          },
        });
      }
    });

    it('optional properties are read as undefined in the updater if not set', async () => {
      const db = new DB({
        schema,
      });
      await db.insert('test', {
        id: 'item1',
        record: {
          attr: 'attr',
        },
      });
      await db.update('test', 'item1', async (entity) => {
        expect(entity.optionalAttr).toBeUndefined();
        expect(entity.record.optionalAttr).toBeUndefined();
        entity.optionalAttr = 'assigned';
        entity.record.optionalAttr = 'assigned';
        expect(entity.optionalAttr).toBe('assigned');
        expect(entity.record.optionalAttr).toBe('assigned');
      });
    });
  });

  describe('optional records', async () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({
            id: S.Id(),
            optionalRecord: S.Optional(
              S.Record({
                attr: S.String(),
              })
            ),
          }),
        },
      },
    };

    it('can delete optional records', async () => {
      const db = new DB({
        schema,
      });
      await db.insert('test', {
        id: 'item1',
        optionalRecord: {
          attr: 'attr',
        },
      });
      {
        const result = await db.fetchById('test', 'item1');
        expect(result).toEqual({
          id: 'item1',
          optionalRecord: {
            attr: 'attr',
          },
        });
      }
      await db.update('test', 'item1', async (entity) => {
        delete entity.optionalRecord;
      });
      {
        const result = await db.fetchById('test', 'item1');
        expect(result).toEqual({
          id: 'item1',
        });
      }
    });
    it('can set optional records to undefined', async () => {
      const db = new DB({
        schema,
      });
      await db.insert('test', {
        id: 'item1',
        optionalRecord: {
          attr: 'attr',
        },
      });
      {
        const result = await db.fetchById('test', 'item1');
        expect(result).toEqual({
          id: 'item1',
          optionalRecord: {
            attr: 'attr',
          },
        });
      }
      await db.update('test', 'item1', async (entity) => {
        entity.optionalRecord = undefined;
      });
      {
        const result = await db.fetchById('test', 'item1');
        expect(result).toEqual({
          id: 'item1',
        });
      }
    });
  });
  it('can add and delete from optional sets', async () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({
            id: S.Id(),
            optionalSet: S.Optional(S.Set(S.Number())),
          }),
        },
      },
    };
    const db = new DB({
      schema,
    });
    await db.insert('test', {
      id: 'item1',
      optionalSet: new Set([1, 2]),
    });
    await db.update('test', 'item1', async (entity) => {
      entity.optionalSet.add(3);
    });
    await db.update('test', 'item1', async (entity) => {
      entity.optionalSet.delete(1);
    });
    const result = await db.fetchById('test', 'item1');
    expect(result!.optionalSet?.entries()).toEqual(new Set([2, 3]).entries());
    await db.update('test', 'item1', async (entity) => {
      entity.optionalSet = undefined;
    });
    expect((await db.fetchById('test', 'item1'))!.optionalSet).toBeUndefined();
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { Schema as S } from '../src/schema/builder.js';
import { DB } from '../src';
import { DBSerializationError } from '../src/errors.ts';

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
  let defaultRecord: { id: string; data: any };
  beforeEach(() => {
    defaultRecord = {
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
  });

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
      address: { street: null, city: null },
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
        street: null,
        city: null,
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
        firstName: null,
        address: {
          street: '123 Main St',
          city: null,
        },
      });
    });
    {
      const result = await db.fetchById('test', 'alice');
      expect(result.data).toEqual({
        lastName: 'Smith',
        firstName: null,
        address: {
          street: '123 Main St',
          city: null,
        },
      });
    }
    await db.update('test', 'alice', async (entity) => {
      delete entity.data.lastName;
      delete entity.data.address;
      expect(entity.data).toEqual({
        firstName: null,
        lastName: null,
        address: null,
      });
    });
    {
      const result = await db.fetchById('test', 'alice');
      expect(result.data).toEqual({
        firstName: null,
        lastName: null,
        address: null,
      });
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
        deep: null,
      });
    });
    const result = await db.fetchById('test', 'alice');
    expect(result.data).toEqual({
      firstName: 'Alice',
      lastName: 'Smith',
      deep: null,
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
    ).rejects.toThrowError(DBSerializationError);
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
          optionalAttr: null,
          record: {
            attr: 'attr',
            optionalAttr: null,
          },
        });
      }
    });
    // TODO: in general we need to better define if "optional" is by default nullable
    //  because that's how we're storing it
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
        optionalAttr: null,
        record: {
          attr: 'attr',
          optionalAttr: null,
        },
      });
    });

    // TODO: support select
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
          db.query('test').Select(['optionalAttr', 'id'])
        );
        expect(result.find((e) => e.id === 'item1')).toEqual({ id: 'item1' });
      }
      {
        const result = await db.fetch(
          db.query('test').Select(['optionalAttr', 'record', 'id'])
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
                attr: S.String({ default: 'default' }),
              })
            ),
          }),
        },
      },
    };

    it('inserting an optional record does not apply default if not provided', async () => {
      const db = new DB({ schema });
      await db.insert('test', {
        id: '1',
      });
      const result = await db.fetchById('test', '1');
      expect(result!.optionalRecord).toBe(undefined);
    });

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
          optionalRecord: null,
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
          optionalRecord: null,
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
    expect((await db.fetchById('test', 'item1'))!.optionalSet).toBeNull();
  });
});

describe('Nested Properties', () => {
  describe('Schemaless', () => {
    let db: DB;
    const ENTITY_ID = 'business-1';
    beforeEach(async () => {
      db = new DB();
    });

    const defaultData = {
      [ENTITY_ID]: {
        name: 'My Business',
        address: {
          street: {
            number: '123',
            name: 'Main St',
          },
          city: 'San Francisco',
          state: 'CA',
        },
        id: ENTITY_ID,
      },
    };

    it('can insert an entity with nested properties', async () => {
      for (const [id, data] of Object.entries(defaultData)) {
        await db.insert('Businesses', data);
      }
      const query = db.query('Businesses').Id(ENTITY_ID);
      const result = (await db.fetch(query)).find((e) => e.id === ENTITY_ID);
      expect(result.address.street.number).toBe('123');
      expect(result.address.street.name).toBe('Main St');
      expect(result.address.city).toBe('San Francisco');
      expect(result.address.state).toBe('CA');
    });

    it('can update nested properties', async () => {
      for (const [id, data] of Object.entries(defaultData)) {
        await db.insert('Businesses', data);
      }

      const query = db.query('Businesses').Id(ENTITY_ID);
      const preUpdateLookup = (await db.fetch(query)).find(
        (e) => e.id === ENTITY_ID
      );
      expect(preUpdateLookup.address.street.number).toBe('123');
      expect(preUpdateLookup.address.street.name).toBe('Main St');

      await db.update('Businesses', ENTITY_ID, async (entity) => {
        entity.address.street.number = '456';
      });

      const postUpdateLookup = (await db.fetch(query)).find(
        (e) => e.id === ENTITY_ID
      );
      expect(postUpdateLookup.address.street.number).toBe('456');
      expect(postUpdateLookup.address.street.name).toBe('Main St');
    });
    // this is being caused by in-place mutation of the original data
    it('can query based on nested property', async () => {
      for (const [id, data] of Object.entries(defaultData)) {
        await db.insert('Businesses', data);
      }
      {
        const positiveResults = await db.fetch(
          db.query('Businesses').Where([['address.city', '=', 'San Francisco']])
        );
        expect(positiveResults).toHaveLength(1);

        const negativeResults = await db.fetch(
          db.query('Businesses').Where([['address.state', '=', 'TX']])
        );
        expect(negativeResults).toHaveLength(0);
      }
      {
        const positiveResults = await db.fetch(
          db.query('Businesses').Where([['address.street.number', '=', '123']])
        );
        expect(positiveResults).toHaveLength(1);

        const negativeResults = await db.fetch(
          db
            .query('Businesses')
            .Where([['address.street.name', '=', 'noExist']])
        );
        expect(negativeResults).toHaveLength(0);
      }
    });

    it('can select specific nested properties', async () => {
      for (const [id, data] of Object.entries(defaultData)) {
        await db.insert('Businesses', data);
      }

      const results = await db.fetch(
        db.query('Businesses').Select(['address.city', 'address.state', 'id'])
      );
      expect(results).toHaveLength(1);
      const result = results.find((e) => e.id === ENTITY_ID);
      expect(result.address.city).toBe('San Francisco');
      expect(result.address.state).toBe('CA');
      expect(result.address).not.toHaveProperty('street');
    });
  });
  describe('Schemafull', async () => {
    const schema = {
      Businesses: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
          address: S.Record({
            street: S.Record({
              number: S.String(),
              name: S.String(),
            }),
            city: S.String(),
            state: S.String(),
          }),
        }),
      },
    };
    let db: DB<typeof schema>;
    beforeEach(async () => {
      db = new DB({
        schema: { collections: schema },
      });
    });
    const ENTITY_ID = 'business-1';
    const defaultData = {
      [ENTITY_ID]: {
        name: 'My Business',
        address: {
          street: {
            number: '123',
            name: 'Main St',
          },
          city: 'San Francisco',
          state: 'CA',
        },
      },
    };

    // May be duplicated in 'record operations'
    it('can insert an entity with nested properties', async () => {
      for (const [id, data] of Object.entries(defaultData)) {
        await db.insert('Businesses', { ...data, id });
      }

      const query = db.query('Businesses').Id(ENTITY_ID);
      const result = (await db.fetch(query)).find((e) => e.id === ENTITY_ID);
      expect(result.address.street.number).toBe('123');
      expect(result.address.street.name).toBe('Main St');
      expect(result.address.city).toBe('San Francisco');
      expect(result.address.state).toBe('CA');
    });

    // May be duplicated in 'record operations'
    it('rejects inserts of malformed objects', async () => {
      await expect(
        db.insert('Businesses', {
          name: 'My Business',
          address: {
            street: 59, // expects record
            city: 'San Francisco',
            state: 'CA',
          },
        })
      ).rejects.toThrowError(DBSerializationError);

      await expect(
        db.insert('Businesses', {
          name: 'My Business',
          address: {
            street: {
              number: 123, // expects string
              name: 'Main St',
            },
            city: 'San Francisco',
            state: 'CA',
          },
        })
      ).rejects.toThrowError(DBSerializationError);
    });

    it('can query based on nested property', async () => {
      for (const [id, data] of Object.entries(defaultData)) {
        await db.insert('Businesses', data);
      }
      {
        const positiveResults = await db.fetch(
          db.query('Businesses').Where([['address.city', '=', 'San Francisco']])
        );
        expect(positiveResults).toHaveLength(1);

        const negativeResults = await db.fetch(
          db.query('Businesses').Where([['address.state', '=', 'TX']])
        );
        expect(negativeResults).toHaveLength(0);
      }
      {
        const positiveResults = await db.fetch(
          db.query('Businesses').Where([['address.street.number', '=', '123']])
        );
        expect(positiveResults).toHaveLength(1);

        const negativeResults = await db.fetch(
          db
            .query('Businesses')
            .Where([['address.street.name', '=', 'noExist']])
        );
        expect(negativeResults).toHaveLength(0);
      }
    });
  });
});

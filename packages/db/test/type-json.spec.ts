import { describe, expect, it } from 'vitest';
import { Schema as S } from '../src/schema/builder.js';
import { DB } from '../src/db.js';
import { DBSerializationError } from '../src/index.js';

const REQUIRED_SCHEMA = {
  collections: {
    test: {
      schema: S.Schema({
        id: S.Id(),
        data: S.Json(),
      }),
    },
  },
};
const OPTIONAL_SCHEMA = {
  collections: {
    test: {
      schema: S.Schema({
        id: S.Id(),
        data: S.Json({ nullable: true }),
      }),
    },
  },
};

describe('json operations', () => {
  describe('insert', () => {
    it('can insert boolean', async () => {
      const db = new DB({ schema: REQUIRED_SCHEMA });
      await db.insert('test', {
        data: true,
        id: '1',
      });
      await db.insert('test', {
        data: false,
        id: '2',
      });
      const query = db.query('test');
      const result = await db.fetch(query);
      expect(result).toEqual([
        {
          id: '1',
          data: true,
        },
        {
          id: '2',
          data: false,
        },
      ]);
    });
    it('can insert number', async () => {
      const db = new DB({ schema: REQUIRED_SCHEMA });
      await db.insert('test', {
        data: 0,
        id: '1',
      });
      await db.insert('test', {
        data: 1,
        id: '2',
      });
      const query = db.query('test');
      const result = await db.fetch(query);
      expect(result).toEqual([
        {
          id: '1',
          data: 0,
        },
        {
          id: '2',
          data: 1,
        },
      ]);
    });
    it('can insert string', async () => {
      const db = new DB({ schema: REQUIRED_SCHEMA });
      await db.insert('test', {
        data: '',
        id: '1',
      });
      await db.insert('test', {
        data: 'test',
        id: '2',
      });
      const query = db.query('test');
      const result = await db.fetch(query);
      expect(result).toEqual([
        {
          id: '1',
          data: '',
        },
        {
          id: '2',
          data: 'test',
        },
      ]);
    });
    it('can insert null', async () => {
      const db = new DB({ schema: OPTIONAL_SCHEMA });
      await db.insert('test', {
        data: null,
        id: '1',
      });
      const query = db.query('test');
      const result = await db.fetch(query);
      expect(result).toEqual([
        {
          id: '1',
          data: null,
        },
      ]);
    });
    it('can insert an array', async () => {
      const db = new DB({ schema: REQUIRED_SCHEMA });
      await db.insert('test', {
        data: [],
        id: '1',
      });
      await db.insert('test', {
        data: [1, 2, 3],
        id: '2',
      });
      const query = db.query('test');
      const result = await db.fetch(query);
      expect(result).toEqual([
        {
          id: '1',
          data: [],
        },
        {
          id: '2',
          data: [1, 2, 3],
        },
      ]);
    });
    it('can insert an object', async () => {
      const db = new DB({ schema: REQUIRED_SCHEMA });
      await db.insert('test', {
        data: {},
        id: '1',
      });
      await db.insert('test', {
        data: { test: 1 },
        id: '2',
      });
      const query = db.query('test');
      const result = await db.fetch(query);
      expect(result).toEqual([
        {
          id: '1',
          data: {},
        },
        {
          id: '2',
          data: { test: 1 },
        },
      ]);
    });
    it.todo('insert undefined');
  });

  describe('update', () => {
    it('can assign a boolean', async () => {
      const db = new DB({ schema: REQUIRED_SCHEMA });
      await db.insert('test', {
        data: 'test',
        id: '1',
      });
      await db.update('test', '1', {
        data: false,
      });
      const query = db.query('test');
      const result = await db.fetch(query);
      expect(result).toEqual([
        {
          id: '1',
          data: false,
        },
      ]);
    });
    it('can assign a number', async () => {
      const db = new DB({ schema: REQUIRED_SCHEMA });
      await db.insert('test', {
        data: 'test',
        id: '1',
      });
      await db.update('test', '1', {
        data: 1,
      });
      const query = db.query('test');
      const result = await db.fetch(query);
      expect(result).toEqual([
        {
          id: '1',
          data: 1,
        },
      ]);
    });
    it('can assign a string', async () => {
      const db = new DB({ schema: REQUIRED_SCHEMA });
      await db.insert('test', {
        data: 'test',
        id: '1',
      });
      await db.update('test', '1', {
        data: 'test2',
      });
      const query = db.query('test');
      const result = await db.fetch(query);
      expect(result).toEqual([
        {
          id: '1',
          data: 'test2',
        },
      ]);
    });
    it('can assign null', async () => {
      const db = new DB({ schema: OPTIONAL_SCHEMA });
      await db.insert('test', {
        data: 'test',
        id: '1',
      });
      await db.update('test', '1', {
        data: null,
      });
      const query = db.query('test');
      const result = await db.fetch(query);
      expect(result).toEqual([
        {
          id: '1',
          data: null,
        },
      ]);
    });
    describe('array', () => {
      it('can assign an array', async () => {
        const db = new DB({ schema: REQUIRED_SCHEMA });
        await db.insert('test', {
          data: 'test',
          id: '1',
        });
        await db.update('test', '1', {
          data: [1, 2, 3],
        });
        const query = db.query('test');
        const result = await db.fetch(query);
        expect(result).toEqual([
          {
            id: '1',
            data: [1, 2, 3],
          },
        ]);
      });
      it('can overwrite an array with value', async () => {
        const db = new DB({ schema: REQUIRED_SCHEMA });
        await db.insert('test', {
          data: [1, 2, 3],
          id: '1',
        });
        await db.update('test', '1', {
          data: 1,
        });
        const query = db.query('test');
        const result = await db.fetch(query);
        expect(result).toEqual([
          {
            id: '1',
            data: 1,
          },
        ]);
      });
      it('can overwrite an array with array', async () => {
        const db = new DB({ schema: REQUIRED_SCHEMA });
        await db.insert('test', {
          data: [1, 2, 3],
          id: '1',
        });
        await db.update('test', '1', {
          data: [4, 5],
        });
        const query = db.query('test');
        {
          const result = await db.fetch(query);
          expect(result).toEqual([
            {
              id: '1',
              data: [4, 5],
            },
          ]);
        }
        await db.update('test', '1', {
          data: [],
        });
        {
          const result = await db.fetch(query);
          expect(result).toEqual([
            {
              id: '1',
              data: [],
            },
          ]);
        }
      });
      it('can append to an array', async () => {
        const db = new DB({ schema: REQUIRED_SCHEMA });
        await db.insert('test', {
          data: [1, 2, 3],
          id: '1',
        });
        await db.update('test', '1', (entity) => {
          entity.data.push(4);
        });
        const query = db.query('test');
        const result = await db.fetch(query);
        expect(result).toEqual([
          {
            id: '1',
            data: [1, 2, 3, 4],
          },
        ]);
      });
      it('can assign at an index', async () => {
        const db = new DB({ schema: REQUIRED_SCHEMA });
        await db.insert('test', {
          data: [1, 2, 3],
          id: '1',
        });
        await db.update('test', '1', (entity) => {
          entity.data[0] = 4;
        });
        const query = db.query('test');
        const result = await db.fetch(query);
        expect(result).toEqual([
          {
            id: '1',
            data: [4, 2, 3],
          },
        ]);
      });
    });

    describe('object', () => {
      it('can assign an object', async () => {
        const db = new DB({ schema: REQUIRED_SCHEMA });
        await db.insert('test', {
          data: 'test',
          id: '1',
        });
        await db.update('test', '1', {
          data: { test: 1 },
        });
        const query = db.query('test');
        const result = await db.fetch(query);
        expect(result).toEqual([
          {
            id: '1',
            data: { test: 1 },
          },
        ]);
      });
      it('can overwrite an object with value', async () => {
        const db = new DB({ schema: REQUIRED_SCHEMA });
        await db.insert('test', {
          data: { test: 1 },
          id: '1',
        });
        await db.update('test', '1', {
          data: 1,
        });
        const query = db.query('test');
        const result = await db.fetch(query);
        expect(result).toEqual([
          {
            id: '1',
            data: 1,
          },
        ]);
      });
      it('can overwrite an object with an object', async () => {
        const db = new DB({ schema: REQUIRED_SCHEMA });
        await db.insert('test', {
          data: { test: 1 },
          id: '1',
        });
        await db.update('test', '1', (entity) => {
          entity.data = { test2: 2 };
        });
        const query = db.query('test');
        {
          const result = await db.fetch(query);
          expect(result).toEqual([
            {
              id: '1',
              data: {
                test: null,
                test2: 2,
              },
            },
          ]);
        }
        await db.update('test', '1', (entity) => {
          entity.data = {};
        });
        {
          const result = await db.fetch(query);
          expect(result).toEqual([
            {
              id: '1',
              data: {
                test: null,
                test2: null,
              },
            },
          ]);
        }
      });
      it('can add an attribute at a path', async () => {
        const db = new DB({ schema: REQUIRED_SCHEMA });
        await db.insert('test', {
          data: { test: 1 },
          id: '1',
        });
        await db.update('test', '1', (entity) => {
          entity.data.test2 = 2;
        });
        const query = db.query('test');
        const result = await db.fetch(query);
        expect(result).toEqual([
          {
            id: '1',
            data: { test: 1, test2: 2 },
          },
        ]);
      });
      it('can overwrite an attribute at a path', async () => {
        const db = new DB({ schema: REQUIRED_SCHEMA });
        await db.insert('test', {
          data: { test: 1 },
          id: '1',
        });
        await db.update('test', '1', (entity) => {
          entity.data.test = 2;
        });
        const query = db.query('test');
        const result = await db.fetch(query);
        expect(result).toEqual([
          {
            id: '1',
            data: { test: 2 },
          },
        ]);
      });
      it('can overwrite an attribute at a nested path', async () => {
        const db = new DB({ schema: REQUIRED_SCHEMA });
        await db.insert('test', {
          data: { test: 1, address: { city: 'test', state: 'test' } },
          id: '1',
        });
        await db.update('test', '1', (entity) => {
          entity.data.address.city = 'test2';
        });
        const query = db.query('test');
        const result = await db.fetch(query);
        expect(result).toEqual([
          {
            id: '1',
            data: { test: 1, address: { city: 'test2', state: 'test' } },
          },
        ]);
      });
      it('can delete an attribute at a path', async () => {
        const db = new DB({ schema: REQUIRED_SCHEMA });
        await db.insert('test', {
          data: { test: 1 },
          id: '1',
        });
        await db.update('test', '1', (entity) => {
          delete entity.data.test;
        });
        const query = db.query('test');
        const result = await db.fetch(query);
        expect(result).toEqual([
          {
            id: '1',
            data: { test: null },
          },
        ]);
      });
    });
  });
});

describe('required', () => {
  it('throws an error if the value is missing', async () => {
    const db = new DB({ schema: REQUIRED_SCHEMA });
    await expect(
      db.insert(
        'test',
        // @ts-expect-error
        {
          id: 'test',
        }
      )
    ).rejects.toThrow(DBSerializationError);
  });
  it('will throw an error if you delete the attribute', async () => {
    const db = new DB({ schema: REQUIRED_SCHEMA });
    await db.insert('test', {
      data: {
        name: 'test',
        age: 1,
      },
      id: 'test',
    });
    await expect(
      db.update('test', 'test', (entity) => {
        delete entity.data;
      })
    ).rejects.toThrow(DBSerializationError);
  });
});

describe('optional', () => {
  it('not required on insert', async () => {
    const db = new DB({ schema: OPTIONAL_SCHEMA });
    await db.insert('test', {
      id: 'test',
    });
    const query = db.query('test');
    const result = await db.fetch(query);
    expect(result).toEqual([
      {
        id: 'test',
      },
    ]);
  });
  it('can be set to null', async () => {
    const db = new DB({ schema: OPTIONAL_SCHEMA });
    await db.insert('test', {
      id: 'test',
      data: {
        name: 'test',
        age: 1,
      },
    });
    await db.update('test', 'test', (entity) => {
      entity.data = null;
    });
    const query = db.query('test');
    const result = await db.fetch(query);
    expect(result).toEqual([
      {
        id: 'test',
        data: null,
      },
    ]);
  });
  it('can be set to undefined', async () => {
    const db = new DB({ schema: OPTIONAL_SCHEMA });
    await db.insert('test', {
      id: 'test',
      data: {
        name: 'test',
        age: 1,
      },
    });
    await db.update('test', 'test', (entity) => {
      entity.data = undefined;
    });
    const query = db.query('test');
    const result = await db.fetch(query);
    expect(result).toEqual([
      {
        id: 'test',
        data: null,
      },
    ]);
  });
  it('can delete the object', async () => {
    const db = new DB({ schema: OPTIONAL_SCHEMA });
    await db.insert('test', {
      id: 'test',
      data: {
        name: 'test',
        age: 1,
      },
    });
    await db.update('test', 'test', (entity) => {
      delete entity.data;
    });
    const query = db.query('test');
    const result = await db.fetch(query);
    expect(result).toEqual([
      {
        id: 'test',
        data: null,
      },
    ]);
  });
});

describe('default value', () => {
  it('primitive', async () => {
    const db = new DB({
      schema: {
        collections: {
          test: {
            schema: S.Schema({
              id: S.Id(),
              data: S.Json({ default: 1 }),
            }),
          },
        },
      },
    });
    await db.insert('test', {
      id: 'test',
    });
    const query = db.query('test');
    const result = await db.fetch(query);
    expect(result).toEqual([
      {
        id: 'test',
        data: 1,
      },
    ]);
  });
  it('empty object', async () => {
    const db = new DB({
      schema: {
        collections: {
          test: {
            schema: S.Schema({
              id: S.Id(),
              data: S.Json({ default: {} }),
            }),
          },
        },
      },
    });
    await db.insert('test', {
      id: 'test',
    });
    const query = db.query('test');
    const result = await db.fetch(query);
    expect(result).toEqual([
      {
        id: 'test',
        data: {},
      },
    ]);
  });
  it('non empty object', async () => {
    const db = new DB({
      schema: {
        collections: {
          test: {
            schema: S.Schema({
              id: S.Id(),
              data: S.Json({ default: { name: 'test' } }),
            }),
          },
        },
      },
    });
    await db.insert('test', {
      id: 'test',
    });
    const query = db.query('test').Where('data.name', '=', 'test');
    const result = await db.fetch(query);
    expect(result).toEqual([
      {
        id: 'test',
        data: { name: 'test' },
      },
    ]);
  });
  it('empty array', async () => {
    const db = new DB({
      schema: {
        collections: {
          test: {
            schema: S.Schema({
              id: S.Id(),
              data: S.Json({ default: [] }),
            }),
          },
        },
      },
    });
    await db.insert('test', {
      id: 'test',
    });
    const query = db.query('test');
    const result = await db.fetch(query);
    expect(result).toEqual([
      {
        id: 'test',
        data: [],
      },
    ]);
  });
  it('non empty array', async () => {
    const db = new DB({
      schema: {
        collections: {
          test: {
            schema: S.Schema({
              id: S.Id(),
              data: S.Json({ default: [1, 2, 3] }),
            }),
          },
        },
      },
    });
    await db.insert('test', {
      id: 'test',
    });
    const query = db.query('test');
    const result = await db.fetch(query);
    expect(result).toEqual([
      {
        id: 'test',
        data: [1, 2, 3],
      },
    ]);
  });
});

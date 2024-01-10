import { it, expect, describe } from 'vitest';
import { createMigration } from '../src/migration';
import { Models, Schema as S, hashSchemaJSON, schemaToJSON } from '@triplit/db';
import { schemaFileContentFromMigrations } from '../src/commands/migrate/codegen';
import { importFresh, transpileTsString } from '../src/schema';
import fs from 'fs';
import path from 'path';

// TODO: evaluate the best way to test the CLI
// Test helpers
// Mock server and test more e2e (more testing of run() directly)

// This test is a start to our testing
// We should be able to define a schema, generate a migration, then run codegen with the migration and get out an equivalent schema
it('codegen can generate a schema from migrations', async () => {
  // Define a schema (add types you'd like to test)
  const schema = {
    test: {
      schema: S.Schema({
        id: S.Id(),
        // value types
        string: S.String(),
        boolean: S.Boolean(),
        number: S.Number(),
        date: S.Date(),
        // set type
        set: S.Set(S.String()),
        // record type
        record: S.Record({
          attr1: S.String(),
          attr2: S.String(),
        }),
        // nullable
        nullableFalse: S.String({ nullable: false }),
        nullableTrue: S.String({ nullable: true }),
        // default values
        defaultValue: S.String({ default: 'default' }),
        defaultNull: S.String({ default: null }),
        // default functions
        defaultNow: S.String({ default: S.Default.now() }),
        defaultUuid: S.String({ default: S.Default.uuid() }),
        defaultUuidArgs: S.String({ default: S.Default.uuid('4') }),

        subQuery: S.Query({
          collectionName: 'collection',
          where: [['attr', '=', 'value']],
        }),
        relationMany: S.RelationMany({
          collectionName: 'collection',
          where: [['attr', '=', 'value']],
          order: [['attr', 'ASC']],
          limit: 10,
        }),
        relationOne: S.RelationOne({
          collectionName: 'collection',
          where: [['attr', '=', 'value']],
          order: [['attr', 'DESC']],
        }),
        relationById: S.RelationById('collection', 'id'),
      }),
      rules: {
        read: {
          'read-rule': {
            description: 'read rule',
            filter: [['id', '=', '1']],
          },
        },
        write: {
          'write-rule': {
            description: 'write rule',
            filter: [['id', '=', '1']],
          },
        },
      },
    },
  } satisfies Models<any, any>;
  const jsonSchema = schemaToJSON({ collections: schema, version: 0 })!;

  // Create a migration
  const migration = createMigration({}, jsonSchema.collections, 1, 0, '');
  if (!migration) throw new Error('migration is undefined');

  // Generate a schema from the migration
  const schemaFileContent = await schemaFileContentFromMigrations([migration]);
  const codegenSchemaFileStr = transpileTsString(schemaFileContent);
  const codegenSchema = await schemaFromFileString(codegenSchemaFileStr);
  const codegenSchemaJSON = schemaToJSON({
    collections: codegenSchema,
    version: 0,
  })!;

  // Check no migration will be created
  expect(
    createMigration(
      jsonSchema.collections,
      codegenSchemaJSON.collections,
      1,
      0,
      ''
    )
  ).toBe(undefined);

  // check schemas match
  const hash1 = hashSchemaJSON(jsonSchema.collections);
  const hash2 = hashSchemaJSON(codegenSchemaJSON.collections);
  expect(hash1).toBe(hash2);
});

it('codegen can handle kebab case collections and attributes', async () => {
  const schema = {
    'test-collection': {
      schema: S.Schema({
        id: S.Id(),
        'string-attr': S.String(),
      }),
    },
  } satisfies Models<any, any>;
  const jsonSchema = schemaToJSON({ collections: schema, version: 0 })!;
  const migration = createMigration({}, jsonSchema.collections, 1, 0, '');
  if (!migration) throw new Error('migration is undefined');
  const schemaFileContent = await schemaFileContentFromMigrations([migration]);
  const codegenSchemaFileStr = transpileTsString(schemaFileContent);
  const codegenSchema = await schemaFromFileString(codegenSchemaFileStr);
  const codegenSchemaJSON = schemaToJSON({
    collections: codegenSchema,
    version: 0,
  })!;

  expect(codegenSchemaJSON.collections.hasOwnProperty('test-collection')).toBe(
    true
  );
  expect(
    codegenSchemaJSON.collections[
      'test-collection'
    ].schema.properties.hasOwnProperty('string-attr')
  ).toBe(true);
});

describe('migration creation', () => {
  it('inserts proper metadata on the migration', () => {
    const schema = {
      test: {
        schema: S.Schema({
          id: S.Id(),
        }),
      },
    } satisfies Models<any, any>;
    const jsonSchema = schemaToJSON({ collections: schema, version: 0 })!;
    const migration = createMigration(
      {},
      jsonSchema.collections,
      100,
      200,
      'testing'
    );
    expect(migration?.version).toBe(100);
    expect(migration?.parent).toBe(200);
    expect(migration?.name).toBe('testing');
  });

  it('diffing the same schema should not create a migration', () => {
    const schema = {
      test: {
        schema: S.Schema({
          id: S.Id(),
        }),
      },
    } satisfies Models<any, any>;
    const jsonSchema = schemaToJSON({ collections: schema, version: 0 })!;
    const migration = createMigration(
      jsonSchema.collections,
      jsonSchema.collections,
      1,
      0,
      ''
    );
    expect(migration).toBe(undefined);
  });

  describe('collection changes', () => {
    it('can create a migration that adds a collection (just required properties)', () => {
      const schema = {
        test: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
      } satisfies Models<any, any>;
      const jsonSchema = schemaToJSON({ collections: schema, version: 0 })!;
      const migration = createMigration({}, jsonSchema.collections, 1, 0, '');

      // Should not see any extra info
      expect(migration?.up).toEqual([
        [
          'create_collection',
          {
            name: 'test',
            schema: {
              id: S.Id().toJSON(),
            },
          },
        ],
      ]);
      expect(migration?.down).toEqual([['drop_collection', { name: 'test' }]]);
    });

    // for back compat, adding things to schema definitions should be optional if possible, so ensure optional props are handled
    it('creating a collection will include all specified properties', () => {
      const schema = {
        test: {
          schema: S.Schema({
            id: S.Id(),
          }),
          rules: {},
        },
      } satisfies Models<any, any>;
      const jsonSchema = schemaToJSON({ collections: schema, version: 0 })!;
      const migration = createMigration({}, jsonSchema.collections, 1, 0, '');
      expect(migration?.up).toEqual([
        [
          'create_collection',
          {
            name: 'test',
            schema: {
              id: S.Id().toJSON(),
            },
            rules: {},
          },
        ],
      ]);
      expect(migration?.down).toEqual([['drop_collection', { name: 'test' }]]);
    });

    it('can create a migration that removes a collection', () => {
      const schema = {
        test: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
      } satisfies Models<any, any>;
      const jsonSchema = schemaToJSON({ collections: schema, version: 0 })!;
      const migration = createMigration(jsonSchema.collections, {}, 1, 0, '');
      expect(migration?.up).toEqual([['drop_collection', { name: 'test' }]]);
      expect(migration?.down).toEqual([
        [
          'create_collection',
          {
            name: 'test',
            schema: {
              id: S.Id().toJSON(),
            },
          },
        ],
      ]);
    });
  });

  describe('attribute changes', () => {
    it('can create a migration that adds an attribute', () => {
      const schemaA = {
        test: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
      } satisfies Models<any, any>;
      const schemaB = {
        test: {
          schema: S.Schema({
            id: S.Id(),
            attr: S.String(),
          }),
        },
      } satisfies Models<any, any>;
      const jsonSchemaA = schemaToJSON({ collections: schemaA, version: 0 })!;
      const jsonSchemaB = schemaToJSON({ collections: schemaB, version: 0 })!;
      const migration = createMigration(
        jsonSchemaA.collections,
        jsonSchemaB.collections,
        1,
        0,
        ''
      );
      expect(migration?.up).toEqual([
        [
          'add_attribute',
          {
            collection: 'test',
            path: ['attr'],
            attribute: S.String().toJSON(),
          },
        ],
      ]);
      expect(migration?.down).toEqual([
        [
          'drop_attribute',
          {
            collection: 'test',
            path: ['attr'],
          },
        ],
      ]);
    });

    describe('attribute edits', () => {
      it('can create a migration that edits mulitple attribute', () => {
        const schemaA = {
          test: {
            schema: S.Schema({
              id: S.Id(),
              attr: S.String({ nullable: false }),
            }),
          },
        } satisfies Models<any, any>;
        const schemaB = {
          test: {
            schema: S.Schema({
              id: S.Id(),
              attr: S.String({ nullable: true, default: 'hello world' }),
            }),
          },
        } satisfies Models<any, any>;
        const jsonSchemaA = schemaToJSON({ collections: schemaA, version: 0 })!;
        const jsonSchemaB = schemaToJSON({ collections: schemaB, version: 0 })!;
        const migration = createMigration(
          jsonSchemaA.collections,
          jsonSchemaB.collections,
          1,
          0,
          ''
        );
        expect(migration?.up).toEqual([
          [
            'alter_attribute_option',
            {
              collection: 'test',
              path: ['attr'],
              options: { nullable: true },
            },
          ],
          [
            'alter_attribute_option',
            {
              collection: 'test',
              path: ['attr'],
              options: { default: 'hello world' },
            },
          ],
        ]);
        expect(migration?.down).toEqual([
          [
            'drop_attribute_option',
            {
              collection: 'test',
              path: ['attr'],
              option: 'default',
            },
          ],
          [
            'alter_attribute_option',
            {
              collection: 'test',
              path: ['attr'],
              options: { nullable: false },
            },
          ],
        ]);
      });

      it('can edit default value to function', () => {
        const schemaA = {
          test: {
            schema: S.Schema({
              id: S.Id(),
              attr: S.String({ default: 'hello world' }),
            }),
          },
        } satisfies Models<any, any>;
        const schemaB = {
          test: {
            schema: S.Schema({
              id: S.Id(),
              attr: S.String({ default: S.Default.uuid('5') }),
            }),
          },
        } satisfies Models<any, any>;
        const jsonSchemaA = schemaToJSON({ collections: schemaA, version: 0 })!;
        const jsonSchemaB = schemaToJSON({ collections: schemaB, version: 0 })!;
        const migration = createMigration(
          jsonSchemaA.collections,
          jsonSchemaB.collections,
          1,
          0,
          ''
        );
        expect(migration?.up).toEqual([
          [
            'alter_attribute_option',
            {
              collection: 'test',
              path: ['attr'],
              options: { default: { func: 'uuid', args: ['5'] } },
            },
          ],
        ]);
        expect(migration?.down).toEqual([
          [
            'alter_attribute_option',
            {
              collection: 'test',
              path: ['attr'],
              options: { default: 'hello world' },
            },
          ],
        ]);
      });
    });

    it('can create a migration that removes an attribute', () => {
      const schemaA = {
        test: {
          schema: S.Schema({
            id: S.Id(),
            attr: S.String(),
          }),
        },
      } satisfies Models<any, any>;
      const schemaB = {
        test: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
      } satisfies Models<any, any>;
      const jsonSchemaA = schemaToJSON({ collections: schemaA, version: 0 })!;
      const jsonSchemaB = schemaToJSON({ collections: schemaB, version: 0 })!;
      const migration = createMigration(
        jsonSchemaA.collections,
        jsonSchemaB.collections,
        1,
        0,
        ''
      );
      expect(migration?.up).toEqual([
        [
          'drop_attribute',
          {
            collection: 'test',
            path: ['attr'],
          },
        ],
      ]);
      expect(migration?.down).toEqual([
        [
          'add_attribute',
          {
            collection: 'test',
            path: ['attr'],
            attribute: S.String().toJSON(),
          },
        ],
      ]);
    });
  });

  describe('subquery changes', () => {
    it('can create a migration that adds a subquery', () => {
      const schemaA = {
        test1: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
        test2: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
      } satisfies Models<any, any>;
      const schemaB = {
        test1: {
          schema: S.Schema({
            id: S.Id(),
            subQuery: S.Query({
              collectionName: 'test2',
              where: [['id', '=', '$id']],
            }),
          }),
        },
        test2: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
      } satisfies Models<any, any>;
      const jsonSchemaA = schemaToJSON({ collections: schemaA, version: 0 })!;
      const jsonSchemaB = schemaToJSON({ collections: schemaB, version: 0 })!;
      const migration = createMigration(
        jsonSchemaA.collections,
        jsonSchemaB.collections,
        1,
        0,
        ''
      );
      expect(migration?.up).toEqual([
        [
          'add_attribute',
          {
            collection: 'test1',
            path: ['subQuery'],
            attribute: S.Query({
              collectionName: 'test2',
              where: [['id', '=', '$id']],
            }).toJSON(),
          },
        ],
      ]);
      expect(migration?.down).toEqual([
        [
          'drop_attribute',
          {
            collection: 'test1',
            path: ['subQuery'],
          },
        ],
      ]);
    });
    it('can create a migration that removes a subquery', () => {
      const schemaA = {
        test1: {
          schema: S.Schema({
            id: S.Id(),
            subQuery: S.Query({
              collectionName: 'test2',
              where: [['id', '=', '$id']],
            }),
          }),
        },
        test2: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
      } satisfies Models<any, any>;
      const schemaB = {
        test1: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
        test2: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
      } satisfies Models<any, any>;
      const jsonSchemaA = schemaToJSON({ collections: schemaA, version: 0 })!;
      const jsonSchemaB = schemaToJSON({ collections: schemaB, version: 0 })!;
      const migration = createMigration(
        jsonSchemaA.collections,
        jsonSchemaB.collections,
        1,
        0,
        ''
      );
      expect(migration?.up).toEqual([
        [
          'drop_attribute',
          {
            collection: 'test1',
            path: ['subQuery'],
          },
        ],
      ]);
      expect(migration?.down).toEqual([
        [
          'add_attribute',
          {
            collection: 'test1',
            path: ['subQuery'],
            attribute: S.Query({
              collectionName: 'test2',
              where: [['id', '=', '$id']],
            }).toJSON(),
          },
        ],
      ]);
    });
    it('can create a migration that edits a subquery', () => {
      const schemaA = {
        test1: {
          schema: S.Schema({
            id: S.Id(),
            subQuery: S.Query({
              collectionName: 'test2',
              where: [['id', '=', 'id']],
            }),
          }),
        },
        test2: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
      } satisfies Models<any, any>;
      const schemaB = {
        test1: {
          schema: S.Schema({
            id: S.Id(),
            subQuery: S.Query({
              collectionName: 'test2',
              where: [['id', '=', '$id']],
            }),
          }),
        },
        test2: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
      } satisfies Models<any, any>;
      const jsonSchemaA = schemaToJSON({ collections: schemaA, version: 0 })!;
      const jsonSchemaB = schemaToJSON({ collections: schemaB, version: 0 })!;
      const migration = createMigration(
        jsonSchemaA.collections,
        jsonSchemaB.collections,
        1,
        0,
        ''
      );

      expect(migration?.up).toEqual([
        [
          'drop_attribute',
          {
            collection: 'test1',
            path: ['subQuery'],
          },
        ],
        [
          'add_attribute',
          {
            collection: 'test1',
            path: ['subQuery'],
            attribute: S.Query({
              collectionName: 'test2',
              where: [['id', '=', '$id']],
            }).toJSON(),
          },
        ],
      ]);
      expect(migration?.down).toEqual([
        [
          'drop_attribute',
          {
            collection: 'test1',
            path: ['subQuery'],
          },
        ],
        [
          'add_attribute',
          {
            collection: 'test1',
            path: ['subQuery'],
            attribute: S.Query({
              collectionName: 'test2',
              where: [['id', '=', 'id']],
            }).toJSON(),
          },
        ],
      ]);
    });
    it('can create a migration for a subquery with a changed cardinality', () => {
      const schemaA = {
        test: {
          schema: S.Schema({
            id: S.Id(),
            subquery: S.RelationMany({
              collectionName: 'test2',
              where: [],
            }),
          }),
        },
      } satisfies Models<any, any>;
      const schemaB = {
        test: {
          schema: S.Schema({
            id: S.Id(),
            subquery: S.RelationOne({
              collectionName: 'test2',
              where: [],
            }),
          }),
        },
      } satisfies Models<any, any>;
      const jsonSchemaA = schemaToJSON({ collections: schemaA, version: 0 })!;
      const jsonSchemaB = schemaToJSON({ collections: schemaB, version: 0 })!;
      const migration = createMigration(
        jsonSchemaA.collections,
        jsonSchemaB.collections,
        1,
        0,
        ''
      );
      expect(migration?.up).toEqual([
        [
          'drop_attribute',
          {
            collection: 'test',
            path: ['subquery'],
          },
        ],
        [
          'add_attribute',
          {
            collection: 'test',
            path: ['subquery'],
            attribute: S.RelationOne({
              collectionName: 'test2',
              where: [],
            }).toJSON(),
          },
        ],
      ]);
      expect(migration?.down).toEqual([
        [
          'drop_attribute',
          {
            collection: 'test',
            path: ['subquery'],
          },
        ],
        [
          'add_attribute',
          {
            collection: 'test',
            path: ['subquery'],
            attribute: S.RelationMany({
              collectionName: 'test2',
              where: [],
            }).toJSON(),
          },
        ],
      ]);
    });
  });

  describe('rule changes', () => {
    it('can create a migration that adds a rule', () => {
      const schemaA = {
        test: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
      } satisfies Models<any, any>;
      const schemaB = {
        test: {
          schema: S.Schema({
            id: S.Id(),
          }),
          rules: {
            read: {
              'read-rule': {
                description: 'read rule',
                filter: [['id', '=', '1']],
              },
            },
          },
        },
      } satisfies Models<any, any>;
      const jsonSchemaA = schemaToJSON({ collections: schemaA, version: 0 })!;
      const jsonSchemaB = schemaToJSON({ collections: schemaB, version: 0 })!;
      const migration = createMigration(
        jsonSchemaA.collections,
        jsonSchemaB.collections,
        1,
        0,
        ''
      );
      expect(migration?.up).toEqual([
        [
          'add_rule',
          {
            collection: 'test',
            scope: 'read',
            id: 'read-rule',
            rule: {
              description: 'read rule',
              filter: [['id', '=', '1']],
            },
          },
        ],
      ]);
      expect(migration?.down).toEqual([
        [
          'drop_rule',
          {
            collection: 'test',
            scope: 'read',
            id: 'read-rule',
          },
        ],
      ]);
    });

    it('altering a rule property replaces the entire rule', () => {
      const schemaA = {
        test: {
          schema: S.Schema({
            id: S.Id(),
          }),
          rules: {
            read: {
              'read-rule': {
                description: 'read rule',
                filter: [['id', '=', '1']],
              },
            },
          },
        },
      } satisfies Models<any, any>;

      // change description
      const schemaB = {
        test: {
          schema: S.Schema({
            id: S.Id(),
          }),
          rules: {
            read: {
              'read-rule': {
                description: 'read rule 2',
                filter: [['id', '=', '1']],
              },
            },
          },
        },
      } satisfies Models<any, any>;

      // change filter
      const schemaC = {
        test: {
          schema: S.Schema({
            id: S.Id(),
          }),
          rules: {
            read: {
              'read-rule': {
                description: 'read rule',
                filter: [['id', '=', '2']],
              },
            },
          },
        },
      } satisfies Models<any, any>;
      const jsonSchemaA = schemaToJSON({ collections: schemaA, version: 0 })!;
      const jsonSchemaB = schemaToJSON({ collections: schemaB, version: 0 })!;
      const jsonSchemaC = schemaToJSON({ collections: schemaC, version: 0 })!;
      const migrationAB = createMigration(
        jsonSchemaA.collections,
        jsonSchemaB.collections,
        1,
        0,
        ''
      );
      const migrationAC = createMigration(
        jsonSchemaA.collections,
        jsonSchemaC.collections,
        1,
        0,
        ''
      );
      expect(migrationAB?.up).toEqual([
        [
          'drop_rule',
          {
            collection: 'test',
            scope: 'read',
            id: 'read-rule',
          },
        ],
        [
          'add_rule',
          {
            collection: 'test',
            scope: 'read',
            id: 'read-rule',
            rule: {
              description: 'read rule 2',
              filter: [['id', '=', '1']],
            },
          },
        ],
      ]);
      expect(migrationAB?.down).toEqual([
        [
          'drop_rule',
          {
            collection: 'test',
            scope: 'read',
            id: 'read-rule',
          },
        ],
        [
          'add_rule',
          {
            collection: 'test',
            scope: 'read',
            id: 'read-rule',
            rule: {
              description: 'read rule',
              filter: [['id', '=', '1']],
            },
          },
        ],
      ]);

      expect(migrationAC?.up).toEqual([
        [
          'drop_rule',
          {
            collection: 'test',
            scope: 'read',
            id: 'read-rule',
          },
        ],
        [
          'add_rule',
          {
            collection: 'test',
            scope: 'read',
            id: 'read-rule',
            rule: {
              description: 'read rule',
              filter: [['id', '=', '2']],
            },
          },
        ],
      ]);
      expect(migrationAC?.down).toEqual([
        [
          'drop_rule',
          {
            collection: 'test',
            scope: 'read',
            id: 'read-rule',
          },
        ],
        [
          'add_rule',
          {
            collection: 'test',
            scope: 'read',
            id: 'read-rule',
            rule: {
              description: 'read rule',
              filter: [['id', '=', '1']],
            },
          },
        ],
      ]);
    });

    it('can create a migration that drops a rule', () => {
      const schemaA = {
        test: {
          schema: S.Schema({
            id: S.Id(),
          }),
          rules: {
            read: {
              'read-rule': {
                description: 'read rule',
                filter: [['id', '=', '1']],
              },
            },
          },
        },
      } satisfies Models<any, any>;
      const schemaB = {
        test: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
      } satisfies Models<any, any>;
      const jsonSchemaA = schemaToJSON({ collections: schemaA, version: 0 })!;
      const jsonSchemaB = schemaToJSON({ collections: schemaB, version: 0 })!;
      const migration = createMigration(
        jsonSchemaA.collections,
        jsonSchemaB.collections,
        1,
        0,
        ''
      );
      expect(migration?.up).toEqual([
        [
          'drop_rule',
          {
            collection: 'test',
            scope: 'read',
            id: 'read-rule',
          },
        ],
      ]);
      expect(migration?.down).toEqual([
        [
          'add_rule',
          {
            collection: 'test',
            scope: 'read',
            id: 'read-rule',
            rule: {
              description: 'read rule',
              filter: [['id', '=', '1']],
            },
          },
        ],
      ]);
    });
  });
});

// TODO: maybe move to utility func
async function schemaFromFileString(source: string) {
  const tmpPath = path.join(__dirname, 'tmp', 'schema.ts');
  const tmpDir = path.dirname(tmpPath);
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(tmpPath, source, 'utf8');
    const { schema } = await importFresh(tmpPath);
    return schema;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

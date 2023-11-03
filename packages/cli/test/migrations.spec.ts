import { it, expect } from 'vitest';
import { createMigration } from '../src/migration';
import { Schema as S, hashSchemaJSON, schemaToJSON } from '@triplit/db';
import { schemaFileContentFromMigrations } from '../src/commands/migrate/codegen';
import { transpileTsString } from '../src/schema';
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
      }),
    },
  };
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

// TODO: maybe move to utility func
async function schemaFromFileString(source: string) {
  const tmpPath = path.join(__dirname, 'tmp', 'schema.ts');
  const tmpDir = path.dirname(tmpPath);
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(tmpPath, source, 'utf8');
    const { schema } = await import(tmpPath);
    return schema;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

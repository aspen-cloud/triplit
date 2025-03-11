import { describe, test, expectTypeOf } from 'vitest';
import { DB, Schema as S } from '../../src/index.js';
import { EXHAUSTIVE_SCHEMA } from '../utils/exhaustive-schema.js';
import { ExhaustiveSchemaSelectAll, Extends, fakeTx } from './utils.js';

describe('schemaful', () => {
  test('collection param includes all collections', () => {
    const schema = {
      collections: {
        a: {
          schema: S.Schema({
            id: S.Id(),
            attr: S.String(),
          }),
        },
        b: {
          schema: S.Schema({
            id: S.Id(),
            attr: S.String(),
          }),
        },
        c: {
          schema: S.Schema({
            id: S.Id(),
            attr: S.String(),
          }),
        },
      },
    };
    const db = new DB({ schema });
    const tx = fakeTx(db);
    expectTypeOf(db.update).parameter(0).toEqualTypeOf<'a' | 'b' | 'c'>();
    expectTypeOf(tx.update).parameter(0).toEqualTypeOf<'a' | 'b' | 'c'>();
  });

  test('entity param allows partial model for patching', () => {
    const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
    const tx = fakeTx(db);
    type UpdateParam = Parameters<typeof db.update<'test'>>[2];
    expectTypeOf<
      Extends<Partial<ExhaustiveSchemaSelectAll>, UpdateParam>
    >().toEqualTypeOf<true>();
  });

  test('entity param in updater properly reads proxy values from schema', () => {
    const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
    const tx = fakeTx(db);
    db.update('test', 'id', (entity) => {
      expectTypeOf(entity).toEqualTypeOf<ExhaustiveSchemaSelectAll>();
    });

    tx.update('test', 'id', (entity) => {
      expectTypeOf(entity).toEqualTypeOf<ExhaustiveSchemaSelectAll>();
    });
  });
});

describe('schemaless', () => {
  test('collection param is string', () => {
    const db = new DB();
    const tx = fakeTx(db);
    expectTypeOf(db.update).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(tx.update).parameter(0).toEqualTypeOf<string>();
  });

  test('entity param allows partial model for patching ({ [x:string]: any })', () => {
    const db = new DB();
    const tx = fakeTx(db);
    type UpdateParam = Parameters<typeof db.update<'test'>>[2];
    expectTypeOf<
      Extends<{ [x: string]: any }, UpdateParam>
    >().toEqualTypeOf<true>();
  });

  test('entity param in updater is { [x:string]: any }', () => {
    const db = new DB();
    const tx = fakeTx(db);
    expectTypeOf(db.update)
      .parameter(2)
      .parameter(0)
      .toEqualTypeOf<{ [x: string]: any }>();
    expectTypeOf(tx.update)
      .parameter(2)
      .parameter(0)
      .toEqualTypeOf<{ [x: string]: any }>();
  });
});

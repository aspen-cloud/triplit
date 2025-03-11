import { expectTypeOf, test, describe } from 'vitest';
import { Schema as S } from '@triplit/db';
import { HttpClient } from '../../../src/http-client/http-client.js';

describe('.insert()', () => {
  describe('schemaful', () => {
    const schema = {
      a: {
        schema: S.Schema({
          id: S.Id(),
          attrA: S.String(),
        }),
        relationships: {
          b: S.RelationById('b', '$id'),
        },
      },
      b: {
        schema: S.Schema({
          id: S.Id(),
          attrB: S.String(),
        }),
      },
    };
    test('collectionName arg is typed as collection names in schema', async () => {
      const client = new HttpClient({ schema });
      expectTypeOf(client.insert).parameter(0).toEqualTypeOf<'a' | 'b'>();
    });

    test('entity arg is typed as model of collection', async () => {
      const client = new HttpClient({ schema });
      const expectEntityParamA = expectTypeOf(client.insert<'a'>).parameter(1);
      expectEntityParamA.toEqualTypeOf<{
        id?: string | null | undefined;
        attrA: string;
      }>();
      const expectEntityParamB = expectTypeOf(client.insert<'b'>).parameter(1);
      expectEntityParamB.toEqualTypeOf<{
        id?: string | null | undefined;
        attrB: string;
      }>();
    });
    describe('schemaless', () => {
      test('collectionName arg is typed as string', () => {
        const client = new HttpClient();
        expectTypeOf(client.insert).parameter(0).toEqualTypeOf<string>();
      });

      test('entity arg is typed as { [x: string]: any }', () => {
        const client = new HttpClient();
        expectTypeOf(client.insert<'a'>)
          .parameter(1)
          .toEqualTypeOf<{ [x: string]: any }>();
      });
    });
  });

  describe('.bulkInsert()', () => {
    describe('schemaful', () => {
      const schema = {
        a: {
          schema: S.Schema({
            id: S.Id(),
            attrA: S.String(),
          }),
        },
        b: {
          schema: S.Schema({
            id: S.Id(),
            attrB: S.String(),
          }),
        },
      };
      test('bulk arg is typed as BulkInsert', async () => {
        const client = new HttpClient({ schema });
        expectTypeOf(client.bulkInsert).parameter(0).toEqualTypeOf<{
          a?: Array<{
            id?: string | null | undefined;
            attrA: string;
          }>;
          b?: Array<{
            id?: string | null | undefined;
            attrB: string;
          }>;
        }>();
      });
    });

    describe('schemaless', () => {
      test('bulk arg is typed as Record of schemaless entity arrays', () => {
        const client = new HttpClient();
        expectTypeOf(client.bulkInsert).parameter(0).toEqualTypeOf<{
          [x: string]:
            | {
                [x: string]: any;
              }[]
            | undefined;
        }>();
      });
    });
  });
});

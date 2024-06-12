import { expectTypeOf, test, describe } from 'vitest';
import { TriplitClient } from '../../dist/triplit-client';
import { Schema as S } from '@triplit/db';

describe('Collection name', () => {
  describe('schemaful', () => {
    test('client.query() is typed as colleciton names in schema', () => {
      const schema = {
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
      };
      const client = new TriplitClient({ schema });
      expectTypeOf<typeof client.query>()
        .parameter(0)
        .toEqualTypeOf<'a' | 'b'>();
    });
  });
  describe('schemaless', () => {
    test('client.query() is typed as string', () => {
      const client = new TriplitClient();
      expectTypeOf<typeof client.query>().parameter(0).toEqualTypeOf<string>();
    });
  });
});

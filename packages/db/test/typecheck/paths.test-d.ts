import { expectTypeOf, test } from 'vitest';
import { Schema as S } from '../../src/schema/builder.js';
import { SchemaPaths } from '../../src/schema/types';

test('SchemaPaths expands a schema to max depth 3', () => {
  const schema = {
    a: {
      schema: S.Schema({
        id: S.Id(),
        b: S.RelationById('b', '$id'),
      }),
    },
    b: {
      schema: S.Schema({
        id: S.Id(),
        a: S.RelationById('a', '$id'),
      }),
    },
  };
  expectTypeOf<SchemaPaths<typeof schema, 'a'>>().toEqualTypeOf<
    'id' | 'b.id' | 'b.a.id' | 'b.a.b.id' | `b.a.b.a.${any}`
  >();
});

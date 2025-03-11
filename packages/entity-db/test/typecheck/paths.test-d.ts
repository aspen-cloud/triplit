import { expectTypeOf, test } from 'vitest';
import { Schema as S } from '../../src/schema/builder.js';
import { ModelPaths } from '../../src/schema/types/index.js';

test('SchemaPaths expands a schema to max depth 3', () => {
  const schema = {
    a: {
      schema: S.Schema({
        id: S.Id(),
      }),
      relationships: {
        b: S.RelationById('b', '$id'),
      },
    },
    b: {
      schema: S.Schema({
        id: S.Id(),
      }),
      relationships: {
        a: S.RelationById('a', '$id'),
      },
    },
  };
  // TODO:
  expectTypeOf<ModelPaths<typeof schema, 'a'>>().toEqualTypeOf<
    'id' | 'b.id' | `b.a.${string}`
  >();
});

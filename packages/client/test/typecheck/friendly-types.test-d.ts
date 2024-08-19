import { expectTypeOf, test } from 'vitest';
import { Schema as S } from '@triplit/db';
import { Entity } from '../../src/client/types';

test('Entity', () => {
  const schema = {
    a: {
      schema: S.Schema({
        id: S.Id(),
        a_attr: S.String(),
        rel: S.RelationById('b', '$bId'),
      }),
    },
    b: {
      schema: S.Schema({
        id: S.Id(),
        b_attr: S.String(),
      }),
    },
  };
  expectTypeOf<Entity<typeof schema, 'a'>>().toEqualTypeOf<{
    id: string;
    a_attr: string;
  }>();
  expectTypeOf<Entity<typeof schema, 'b'>>().toEqualTypeOf<{
    id: string;
    b_attr: string;
  }>();
});

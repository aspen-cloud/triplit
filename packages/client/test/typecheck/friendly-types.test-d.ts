import { expectTypeOf, test } from 'vitest';
import { Schema as S } from '@triplit/db';
import { Entity } from '../../src/utils/query';

test('Entity', () => {
  const schema = {
    a: {
      schema: S.Schema({
        id: S.Id(),
        attr: S.String(),
        rel: S.RelationById('b', '$bId'),
      }),
    },
    b: {
      schema: S.Schema({
        id: S.Id(),
        attr: S.String(),
      }),
    },
  };
  expectTypeOf<Entity<typeof schema, 'a'>>().toEqualTypeOf<{
    id: string;
    attr: string;
  }>();
});

import { expectTypeOf, test } from 'vitest';
import { Schema as S } from '@triplit/db';
import { Entity, EntityWithSelection } from '../../src/client/types';

test('Entity', () => {
  const schema = {
    a: {
      schema: S.Schema({
        id: S.Id(),
        a_attr: S.String(),
        optional: S.Optional(S.String()),
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
    optional?: string;
  }>();
  expectTypeOf<Entity<typeof schema, 'b'>>().toEqualTypeOf<{
    id: string;
    b_attr: string;
  }>();
});

test('EntityWithSelection', () => {
  const schema = {
    a: {
      schema: S.Schema({
        id: S.Id(),
        a_attr: S.String(),
        optional: S.Optional(S.String()),
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
  // No selection
  expectTypeOf<EntityWithSelection<typeof schema, 'a'>>().toEqualTypeOf<{
    id: string;
    a_attr: string;
    // One notable difference here is technically we have selected all, so all keys are included
    optional: string | undefined;
  }>();

  // With selection
  expectTypeOf<
    EntityWithSelection<typeof schema, 'a', 'a_attr'>
  >().toEqualTypeOf<{
    a_attr: string;
  }>();

  // With inclusion
  expectTypeOf<
    EntityWithSelection<typeof schema, 'a', 'a_attr', { rel: true }>
  >().toEqualTypeOf<{
    a_attr: string;
    rel: {
      id: string;
      b_attr: string;
    } | null;
  }>();
});

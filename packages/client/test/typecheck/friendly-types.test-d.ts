import { expectTypeOf, test } from 'vitest';
import { Schema as S } from '@triplit/db';
import { Entity, QueryResult } from '../../src/client/types';

test('Entity', () => {
  const schema = S.Collections({
    a: {
      schema: S.Schema({
        id: S.Id(),
        a_attr: S.String(),
        optional: S.Optional(S.String()),
      }),
      relationships: {
        rel: S.RelationById('b', '$1.a_attr'),
      },
    },
    b: {
      schema: S.Schema({
        id: S.Id(),
        b_attr: S.String(),
      }),
    },
  });
  expectTypeOf<Entity<typeof schema, 'a'>>().toEqualTypeOf<{
    id: string;
    a_attr: string;
    optional?: string | null | undefined;
  }>();
  expectTypeOf<Entity<typeof schema, 'b'>>().toEqualTypeOf<{
    id: string;
    b_attr: string;
  }>();
});

test('QueryResult allows for selection and inclusion', () => {
  const schema = S.Collections({
    a: {
      schema: S.Schema({
        id: S.Id(),
        a_attr: S.String(),
        optional: S.Optional(S.String()),
      }),
      relationships: {
        rel: S.RelationById('b', '$1.a_attr'),
      },
    },
    b: {
      schema: S.Schema({
        id: S.Id(),
        b_attr: S.String(),
      }),
    },
  });
  type Test = QueryResult<typeof schema, { collectionName: 'a' }>;

  // No selection
  expectTypeOf<
    QueryResult<typeof schema, { collectionName: 'a' }>
  >().toEqualTypeOf<{
    id: string;
    a_attr: string;
    // TODO: should these keys be optional?
    optional?: string | null | undefined;
  }>();

  // With selection
  expectTypeOf<
    QueryResult<typeof schema, { collectionName: 'a'; select: ['a_attr'] }>
  >().toEqualTypeOf<{
    a_attr: string;
  }>();

  // With inclusion
  expectTypeOf<
    QueryResult<
      typeof schema,
      { collectionName: 'a'; select: ['a_attr']; include: { rel: true } }
    >
  >().toEqualTypeOf<{
    a_attr: string;
    rel: {
      id: string;
      b_attr: string;
    } | null;
  }>();
});

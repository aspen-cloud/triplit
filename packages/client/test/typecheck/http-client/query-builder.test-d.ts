import { expectTypeOf, test, describe } from 'vitest';
import { Schema as S } from '@triplit/db';
import { HttpClient } from '../../../src/http-client/http-client.js';

test('Builder API', () => {
  const client = new HttpClient({
    schema: {
      a: {
        schema: S.Schema({
          id: S.Id(),
          attr: S.String(),
          b: S.RelationById('b', '$id'),
        }),
      },
      b: {
        schema: S.Schema({
          id: S.Id(),
          attr: S.String(),
        }),
      },
    },
  });
  type BuilderKeys =
    | 'after'
    | 'build'
    | 'id'
    | 'include'
    | 'limit'
    | 'order'
    | 'select'
    | 'vars'
    | 'where'
    | 'subquery';

  const builder = client.query('a');
  expectTypeOf<keyof typeof builder>().toEqualTypeOf<BuilderKeys>();

  const builderWithAfter = builder.after(['1', '1']);
  expectTypeOf<keyof typeof builderWithAfter>().toEqualTypeOf<BuilderKeys>();

  const builderWithId = builder.id('1');
  expectTypeOf<keyof typeof builderWithId>().toEqualTypeOf<BuilderKeys>();

  const builderWithInclude = builder.include('b');
  expectTypeOf<keyof typeof builderWithInclude>().toEqualTypeOf<BuilderKeys>();

  const builderWithLimit = builder.limit(1);
  expectTypeOf<keyof typeof builderWithLimit>().toEqualTypeOf<BuilderKeys>();

  const builderWithOrder = builder.order('attr', 'ASC');
  expectTypeOf<keyof typeof builderWithOrder>().toEqualTypeOf<BuilderKeys>();

  const builderWithSelect = builder.select(['id', 'attr']);
  expectTypeOf<keyof typeof builderWithSelect>().toEqualTypeOf<BuilderKeys>();

  const builderWithWhere = builder.where([['attr', '=', 'foo']]);
  expectTypeOf<keyof typeof builderWithWhere>().toEqualTypeOf<BuilderKeys>();
});

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
      const client = new HttpClient({ schema });
      expectTypeOf<typeof client.query>()
        .parameter(0)
        .toEqualTypeOf<'a' | 'b'>();
    });
  });
  describe('schemaless', () => {
    test('client.query() is typed as string', () => {
      const client = new HttpClient();
      expectTypeOf<typeof client.query>().parameter(0).toEqualTypeOf<string>();
    });
  });
});

describe('Queries', () => {
  // TODO: add more specific tests
  test('Basic fetch', async () => {
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
    const client = new HttpClient({ schema });
    const queryA = client.query('a').build();
    {
      const result = await client.fetch(queryA);
      expectTypeOf<typeof result>().toEqualTypeOf<
        {
          id: string;
          attrA: string;
        }[]
      >();
    }
    const queryB = client.query('b').build();
    {
      const result = await client.fetch(queryB);
      expectTypeOf<typeof result>().toEqualTypeOf<
        {
          id: string;
          attrB: string;
        }[]
      >();
    }
  });
  test('Basic fetchOne', async () => {
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
    const client = new HttpClient({ schema });
    const queryA = client.query('a').build();
    {
      const result = await client.fetchOne(queryA);
      expectTypeOf<typeof result>().toEqualTypeOf<{
        id: string;
        attrA: string;
      } | null>();
    }
    const queryB = client.query('b').build();
    {
      const result = await client.fetchOne(queryB);
      expectTypeOf<typeof result>().toEqualTypeOf<{
        id: string;
        attrB: string;
      } | null>();
    }
  });
  test('Basic fetchById', async () => {
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
    const client = new HttpClient({ schema });
    {
      const result = await client.fetchById('a', '1');
      expectTypeOf<typeof result>().toEqualTypeOf<{
        id: string;
        attrA: string;
      } | null>();
    }
    {
      const result = await client.fetchById('b', '1');
      expectTypeOf<typeof result>().toEqualTypeOf<{
        id: string;
        attrB: string;
      } | null>();
    }
  });
});

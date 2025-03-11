import { TriplitClient } from '../src/index.js';
import { expect, it } from 'vitest';
import { Schema as S } from '@triplit/db';

// TODO: refactor sessions so token is checked on connect (ie autoConnect: false is fine to use with token)
const TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ4LXRyaXBsaXQtdG9rZW4tdHlwZSI6InNlY3JldCIsIngtdHJpcGxpdC1wcm9qZWN0LWlkIjoibG9jYWwtcHJvamVjdC1pZCJ9.8Z76XXPc9esdlZb2b7NDC7IVajNXKc4eVcPsO7Ve0ug';

// TODO: there's a lot of state here that can be simplified across Client, HTTPClient, SyncEngine (should just drive from one, shared object)
it('on client creation, should set up HTTP client with proper options passed through', async () => {
  // no options
  {
    const client = new TriplitClient({
      autoConnect: false,
    });
    // TODO: shoudlnt use options.token, fixup init state
    expect(client.options.token).toBeUndefined();
    expect(client.http.options.token).toBeUndefined();
    expect(client.options.serverUrl).toBeUndefined();
    expect(client.http.options.schema).toBeUndefined();
    expect(client.schema).toBeUndefined();
    expect(await client.http.schema()).toBeUndefined();
  }
  // with options
  {
    const schema = S.Collections({
      todos: {
        schema: S.Schema({
          id: S.Id(),
          title: S.String(),
        }),
      },
    });
    const client = new TriplitClient({
      token: TOKEN,
      serverUrl: 'http://localhost',
      schema: schema,
      autoConnect: false,
    });
    // TODO: shoudlnt use options.token, fixup init state
    expect(client.options.token).toBe(TOKEN);
    expect(client.http.options.token).toBe(TOKEN);
    expect(client.options.serverUrl).toBe('http://localhost');
    expect(client.http.options.serverUrl).toBe('http://localhost');
    expect((await client.getSchema())?.collections).toEqual(schema);
    expect(await client.http.schema()).toEqual(schema);
  }
});

// TODO: refactor state so session management isnt getting in the way of these very simple tests
it.todo(
  'as options update on the client, they are passed to the http client',
  async () => {
    const client = new TriplitClient({
      token: TOKEN,
      serverUrl: 'http://localhost',
      autoConnect: false,
    });
    expect(client.token).toBe(TOKEN);
    expect(client.http.options.token).toBe(TOKEN);
    expect(client.options.serverUrl).toBe('http://localhost');
    expect(client.http.options.serverUrl).toBe('http://localhost');

    const newToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ4LXRyaXBsaXQtdG9rZW4tdHlwZSI6InNlY3JldCIsIngtdHJpcGxpdC1wcm9qZWN0LWlkIjoibG9jYWwtcHJvamVjdC1pZCJ9.buFjDUdDUOo4cgzXbr2jzB21QhAm5i3-fU46UM18SSI';
    await client.updateSessionToken(newToken);
    expect(client.token).toBe(newToken);
    expect(client.http.options.token).toBe(newToken);

    //   await client.updateServerUrl('http://new-url');
    //   expect(client.options.serverUrl).toBe('http://new-url');
    //   expect(client.http.options.serverUrl).toBe('http://new-url');
  }
);

it('if the schema changes, the http client should be updated', async () => {
  const schema1 = S.Collections({
    todos: {
      schema: S.Schema({
        id: S.Id(),
        title: S.String(),
      }),
    },
  });

  const client = new TriplitClient({
    schema: schema1,
    autoConnect: false,
  });

  expect(await client.http.schema()).toEqual(schema1);

  const schema2 = S.Collections({
    todos: {
      schema: S.Schema({
        id: S.Id(),
        title: S.String(),
        completed: S.Boolean(),
      }),
    },
  });

  if (client.awaitReady) await client.awaitReady;
  await client.db.overrideSchema({ collections: schema2 });

  expect(await client.http.schema()).toEqual(schema2);
});

import { expect, it, describe } from 'vitest';
import { tempTriplitServer } from '../utils/server.js';
import { HttpClient } from '@triplit/client';
import { Schema as S, TripleRow } from '@triplit/db';

const anonToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ4LXRyaXBsaXQtdG9rZW4tdHlwZSI6ImFub24iLCJ4LXRyaXBsaXQtcHJvamVjdC1pZCI6InByb2plY3QifQ.HKRGDhSqgvJG8x0oOnVTRWtBWYtCkj_7AnBzChNfpjQ';
const serviceToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ4LXRyaXBsaXQtdG9rZW4tdHlwZSI6InNlY3JldCIsIngtdHJpcGxpdC1wcm9qZWN0LWlkIjoicHJvamVjdCJ9.gcDKyZU9wf8o43Ca9kUVXO4KsGwX8IhhyEg1PO1ZqiQ';

process.env.PROJECT_ID = 'project';
process.env.JWT_SECRET = 'test-secret';

async function fetchServerSyncedMetadata(port: number) {
  const res = await fetch(`http://localhost:${port}/queryTriples`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceToken}`,
    },
    body: JSON.stringify({
      query: {
        collectionName: '_metadata',
      },
    }),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return (await res.json()) as TripleRow[];
}

describe('/clear', async () => {
  const DEFAULT_SCHEMA = {
    collections: {
      users: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
        }),
      },
    },
  };

  it('fails without service token', async () => {
    using server = await tempTriplitServer();
    const { port } = server;
    {
      const res = await fetch(`http://localhost:${port}/clear`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonToken}`,
        },
      });
      expect(res.status).toBe(401);
    }
    {
      const res = await fetch(`http://localhost:${port}/clear`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceToken}`,
        },
      });
      expect(res.status).toBe(200);
    }
  });

  it('parameterless only clears data triples', async () => {
    using server = await tempTriplitServer({
      serverOptions: { dbOptions: { schema: DEFAULT_SCHEMA } },
    });
    const { port } = server;
    const client = new HttpClient({
      serverUrl: `http://localhost:${port}`,
      token: serviceToken,
    });
    await new Promise((res) => setTimeout(res, 2000));
    await client.insert('users', { id: '1', name: 'Alice' });
    {
      const dataResult = await client.fetch(client.query('users').build());
      expect(dataResult.length).toBe(1);
      const metadataTriples = await fetchServerSyncedMetadata(port);
      expect(metadataTriples.length).toBeGreaterThan(0);
    }
    await fetch(`http://localhost:${port}/clear`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceToken}`,
      },
    });
    {
      const dataResult = await client.fetch(client.query('users').build());
      expect(dataResult.length).toBe(0);
      const metadataTriples = await fetchServerSyncedMetadata(port);
      expect(metadataTriples.length).toBeGreaterThan(0);
    }
  });

  it('{full: false} only clears data triples', async () => {
    using server = await tempTriplitServer({
      serverOptions: { dbOptions: { schema: DEFAULT_SCHEMA } },
    });
    const { port } = server;
    const client = new HttpClient({
      serverUrl: `http://localhost:${port}`,
      token: serviceToken,
    });
    await client.insert('users', { id: '1', name: 'Alice' });
    {
      const dataResult = await client.fetch(client.query('users').build());
      expect(dataResult.length).toBe(1);
      const metadataTriples = await fetchServerSyncedMetadata(port);
      expect(metadataTriples.length).toBeGreaterThan(0);
    }
    await fetch(`http://localhost:${port}/clear`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceToken}`,
      },
      body: JSON.stringify({ full: false }),
    });
    {
      const dataResult = await client.fetch(client.query('users').build());
      expect(dataResult.length).toBe(0);
      const metadataTriples = await fetchServerSyncedMetadata(port);
      expect(metadataTriples.length).toBeGreaterThan(0);
    }
  });

  it('{full: true} clears all data', async () => {
    await using server = await tempTriplitServer({
      serverOptions: { dbOptions: { schema: DEFAULT_SCHEMA } },
    });
    const { port } = server;
    const client = new HttpClient({
      serverUrl: `http://localhost:${port}`,
      token: serviceToken,
    });
    await client.insert('users', { id: '1', name: 'Alice' });
    {
      const dataResult = await client.fetch(client.query('users').build());
      expect(dataResult.length).toBe(1);
      const metadataTriples = await fetchServerSyncedMetadata(port);
      expect(metadataTriples.length).toBeGreaterThan(0);
    }
    await fetch(`http://localhost:${port}/clear`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceToken}`,
      },
      body: JSON.stringify({ full: true }),
    });
    {
      const dataResult = await client.fetch(client.query('users').build());
      expect(dataResult.length).toBe(0);
      const metadataTriples = await fetchServerSyncedMetadata(port);
      expect(metadataTriples.length).toBe(0);
    }
  });
});

import { beforeEach, expect, it, describe } from 'vitest';
import { withServer } from '../utils/server.js';
import { HttpClient } from '@triplit/client';
import { Schema as S, TripleRow } from '@triplit/db';

const PORT = 8888;

const anonToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ4LXRyaXBsaXQtdG9rZW4tdHlwZSI6ImFub24iLCJ4LXRyaXBsaXQtcHJvamVjdC1pZCI6InByb2plY3QifQ.HKRGDhSqgvJG8x0oOnVTRWtBWYtCkj_7AnBzChNfpjQ';
const serviceToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ4LXRyaXBsaXQtdG9rZW4tdHlwZSI6InNlY3JldCIsIngtdHJpcGxpdC1wcm9qZWN0LWlkIjoicHJvamVjdCJ9.gcDKyZU9wf8o43Ca9kUVXO4KsGwX8IhhyEg1PO1ZqiQ';

process.env.PROJECT_ID = 'project';
process.env.JWT_SECRET = 'test-secret';

// TODO: include this as part of withServer (gives the server a little breather between closing and opening)
beforeEach(async () => {
  await new Promise((res) => setTimeout(res, 1000));
});

async function fetchServerSyncedMetadata() {
  const res = await fetch(`http://localhost:${PORT}/queryTriples`, {
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
    await withServer({ port: PORT }, async (server) => {
      {
        const res = await fetch(`http://localhost:${PORT}/clear`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${anonToken}`,
          },
        });
        expect(res.status).toBe(401);
      }
      {
        const res = await fetch(`http://localhost:${PORT}/clear`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceToken}`,
          },
        });
        expect(res.status).toBe(200);
      }
    });
  });

  it('parameterelss only clears data triples', async () => {
    const client = new HttpClient({
      serverUrl: `http://localhost:${PORT}`,
      token: serviceToken,
    });
    await withServer(
      { port: PORT, serverOptions: { dbOptions: { schema: DEFAULT_SCHEMA } } },
      async (server) => {
        await new Promise((res) => setTimeout(res, 2000));
        await client.insert('users', { id: '1', name: 'Alice' });
        {
          const dataResult = await client.fetch(client.query('users').build());
          expect(dataResult.length).toBe(1);
          const metadataTriples = await fetchServerSyncedMetadata();
          expect(metadataTriples.length).toBeGreaterThan(0);
        }
        await fetch('http://localhost:8888/clear', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceToken}`,
          },
        });
        {
          const dataResult = await client.fetch(client.query('users').build());
          expect(dataResult.length).toBe(0);
          const metadataTriples = await fetchServerSyncedMetadata();
          expect(metadataTriples.length).toBeGreaterThan(0);
        }
      }
    );
  });

  it('{full: false} only clears data triples', async () => {
    const client = new HttpClient({
      serverUrl: `http://localhost:${PORT}`,
      token: serviceToken,
    });
    await withServer(
      { port: PORT, serverOptions: { dbOptions: { schema: DEFAULT_SCHEMA } } },
      async (server) => {
        await client.insert('users', { id: '1', name: 'Alice' });
        {
          const dataResult = await client.fetch(client.query('users').build());
          expect(dataResult.length).toBe(1);
          const metadataTriples = await fetchServerSyncedMetadata();
          expect(metadataTriples.length).toBeGreaterThan(0);
        }
        await fetch('http://localhost:8888/clear', {
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
          const metadataTriples = await fetchServerSyncedMetadata();
          expect(metadataTriples.length).toBeGreaterThan(0);
        }
      }
    );
  });

  it('{full: true} clears all data', async () => {
    const client = new HttpClient({
      serverUrl: `http://localhost:${PORT}`,
      token: serviceToken,
    });
    await withServer(
      {
        port: PORT,
        serverOptions: { dbOptions: { schema: DEFAULT_SCHEMA } },
      },
      async (server) => {
        await client.insert('users', { id: '1', name: 'Alice' });
        {
          const dataResult = await client.fetch(client.query('users').build());
          expect(dataResult.length).toBe(1);
          const metadataTriples = await fetchServerSyncedMetadata();
          expect(metadataTriples.length).toBeGreaterThan(0);
        }
        await fetch('http://localhost:8888/clear', {
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
          const metadataTriples = await fetchServerSyncedMetadata();
          expect(metadataTriples.length).toBe(0);
        }
      }
    );
  });
});

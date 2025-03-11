import { describe, it, expect } from 'vitest';
import { TriplitClient } from '../src/client/triplit-client.js';
import { hashQuery } from '@triplit/entity-db';

describe('hashQuery', () => {
  it('can generate a unique string for a query based on params', () => {
    const client = new TriplitClient({ autoConnect: false });
    const query1 = client.query('users').Where(['name', '=', 'alice']);
    const query2 = client.query('users').Where(['name', '=', 'alice']);
    const query3 = client.query('users').Where(['name', '=', 'bob']);
    const hash1 = hashQuery(query1);
    const hash2 = hashQuery(query2);
    const hash3 = hashQuery(query3);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
  });
  // We should only hash collection query properties for remote subscriptions
  it('ignores non query properties', () => {
    const client = new TriplitClient({ autoConnect: false });
    const query1 = {
      ...client.query('users').Where(['name', '=', 'alice']),
      a: 1,
    };
    const query2 = {
      ...client.query('users').Where(['name', '=', 'alice']),
      b: 2,
    };
    const hash1 = hashQuery(query1);
    const hash2 = hashQuery(query2);
    expect(hash1).toBe(hash2);
  });
});

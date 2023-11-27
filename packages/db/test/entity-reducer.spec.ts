import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TripleRow } from '../src/triple-store.js';
import { Timestamp } from '../src/timestamp.js';
import { triplesToEntities } from '../src/query.js';

describe('Simple Entity Reduction', () => {
  it('can reduce triples to entities', () => {
    const TS: Timestamp = [0, 'test'];
    const COL_NAME = 'Users';
    const triples: TripleRow[] = [
      {
        id: '1',
        attribute: [COL_NAME, 'name'],
        value: 'bob',
        timestamp: TS,
        expired: false,
      },
      {
        id: '1',
        attribute: [COL_NAME, 'email'],
        value: 'bob@example.com',
        timestamp: TS,
        expired: false,
      },
      {
        id: '2',
        attribute: [COL_NAME, 'name'],
        value: 'alice',
        timestamp: TS,
        expired: false,
      },
    ];
    const entities = triplesToEntities(triples);
    expect(entities).toEqual(
      new Map([
        [
          '1',
          {
            name: ['bob', TS],
            email: ['bob@example.com', TS],
          },
        ],
        ['2', { name: ['alice', TS] }],
      ])
    );
  });

  it('ensures only highest timestamps are kept', () => {
    const COL_NAME = 'Users';
    const triples: TripleRow[] = [
      {
        id: '1',
        attribute: [COL_NAME, 'name'],
        value: 'bob',
        timestamp: [0, 'test'],
        expired: false,
      },
      {
        id: '1',
        attribute: [COL_NAME, 'name'],
        value: 'bob2',
        timestamp: [2, 'test'],
        expired: false,
      },
      {
        id: '1',
        attribute: [COL_NAME, 'name'],
        value: 'bob1',
        timestamp: [1, 'test'],
        expired: false,
      },
    ];
    const entities = triplesToEntities(triples);
    expect(entities).toEqual(
      new Map([
        [
          '1',
          {
            name: ['bob2', [2, 'test']],
          },
        ],
      ])
    );
  });

  it('supports tombstoning attributes with expired triples', () => {
    const COL_NAME = 'Users';
    const triples: TripleRow[] = [
      {
        id: '1',
        attribute: [COL_NAME, 'name'],
        value: 'bob',
        timestamp: [0, 'test'],
        expired: false,
      },
      {
        id: '1',
        attribute: [COL_NAME, 'name'],
        value: 'bob2',
        timestamp: [1, 'test'],
        expired: false,
      },
      {
        id: '1',
        attribute: [COL_NAME, 'name'],
        value: null,
        timestamp: [2, 'test'],
        expired: true,
      },
      {
        id: '1',
        attribute: [COL_NAME, 'name'],
        value: 'alice',
        timestamp: [1, 'other-client'],
        expired: false,
      },
    ];
    const entities = triplesToEntities(triples);
    expect(entities).toEqual(
      new Map([
        [
          '1',
          {
            name: [undefined, [2, 'test']],
          },
        ],
      ])
    );
  });
  it('supports overwriting deleted values', () => {
    const COL_NAME = 'Users';
    const triples: TripleRow[] = [
      {
        id: '1',
        attribute: [COL_NAME, 'name'],
        value: 'bob',
        timestamp: [0, 'test'],
        expired: false,
      },
      {
        id: '1',
        attribute: [COL_NAME, 'name'],
        value: 'bob2',
        timestamp: [1, 'test'],
        expired: true,
      },
      {
        id: '1',
        attribute: [COL_NAME, 'name'],
        value: 'alice',
        timestamp: [2, 'other-client'],
        expired: false,
      },
    ];
    const entities = triplesToEntities(triples);
    expect(entities).toEqual(
      new Map([
        [
          '1',
          {
            name: ['alice', [2, 'other-client']],
          },
        ],
      ])
    );
  });
});

describe('Nested Object Reduction', () => {
  it('can created nested properties within an entitiy', () => {
    const TS: Timestamp = [0, 'test'];
    const COL_NAME = 'Users';
    const triples: TripleRow[] = [
      {
        id: '1',
        attribute: [COL_NAME, 'name'],
        value: 'bob',
        timestamp: TS,
        expired: false,
      },
      {
        id: '1',
        attribute: [COL_NAME, 'address', 'street'],
        value: '123 Main St',
        timestamp: TS,
        expired: false,
      },
      {
        id: '1',
        attribute: [COL_NAME, 'address', 'city'],
        value: 'San Francisco',
        timestamp: TS,
        expired: false,
      },
      {
        id: '1',
        attribute: [COL_NAME, 'address', 'state'],
        value: 'CA',
        timestamp: TS,
        expired: false,
      },
    ];
    const entities = triplesToEntities(triples);
    expect(entities).toEqual(
      new Map([
        [
          '1',
          {
            name: ['bob', TS],
            address: {
              street: ['123 Main St', TS],
              city: ['San Francisco', TS],
              state: ['CA', TS],
            },
          },
        ],
      ])
    );
  });
  it('can overwrite nested properties within an entitiy', () => {
    const TS0: Timestamp = [0, 'test'];
    const TS1: Timestamp = [0, 'test'];
    const COL_NAME = 'Users';
    const triples: TripleRow[] = [
      {
        id: '1',
        attribute: [COL_NAME, 'name'],
        value: 'bob',
        timestamp: TS0,
        expired: false,
      },
      {
        id: '1',
        attribute: [COL_NAME, 'address', 'street'],
        value: '123 Main St',
        timestamp: TS0,
        expired: false,
      },
      {
        id: '1',
        attribute: [COL_NAME, 'address', 'city'],
        value: 'San Francisco',
        timestamp: TS0,
        expired: false,
      },
      {
        id: '1',
        attribute: [COL_NAME, 'address', 'state'],
        value: 'CA',
        timestamp: TS0,
        expired: false,
      },
      {
        id: '1',
        attribute: [COL_NAME, 'address', 'state'],
        value: 'NY',
        timestamp: TS1,
        expired: false,
      },
      {
        id: '1',
        attribute: [COL_NAME, 'address', 'city'],
        value: 'New York City',
        timestamp: TS1,
        expired: false,
      },
    ];
    const entities = triplesToEntities(triples);
    expect(entities).toEqual(
      new Map([
        [
          '1',
          {
            name: ['bob', TS0],
            address: {
              street: ['123 Main St', TS0],
              city: ['New York City', TS1],
              state: ['NY', TS1],
            },
          },
        ],
      ])
    );
  });
});

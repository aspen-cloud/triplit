import { expect, it, describe } from 'vitest';
import { DB } from '../src/db.ts';
import { sessionRolesAreEquivalent } from '../src/session.ts';

// TODO: evaluate if we still want to support this
describe('SESSION_USER_ID assignment', () => {
  it('Will assign x-triplit-user-id to SESSION_USER_ID, if one is provided', () => {
    const db = new DB();
    const session = db.withSessionVars({
      'x-triplit-user-id': 'test',
    });
    expect(session.systemVars.$session).toEqual({
      'x-triplit-user-id': 'test',
      SESSION_USER_ID: 'test',
    });
  });
});

describe('scope claim', () => {
  it('Will not assign _scope if scope claim is not provided', () => {
    const db = new DB();
    const session = db.withSessionVars({
      test: '123',
    });
    expect(session.systemVars.$session).toEqual({
      test: '123',
    });
  });
  it('Will not assign _scope if scope claim is not a string', () => {
    const db = new DB();
    const session = db.withSessionVars({
      scope: 123,
    });
    expect(session.systemVars.$session).toEqual({
      scope: 123,
    });
  });
  it('Will not assign _scope if _scope is already assigned', () => {
    const db = new DB();
    const session = db.withSessionVars({
      scope: '123',
      _scope: 'xyz',
    });
    expect(session.systemVars.$session).toEqual({
      scope: '123',
      _scope: 'xyz',
    });
  });
  it('Will assign _scope if scope is parsable', () => {
    const db = new DB();
    const session = db.withSessionVars({
      scope: '123 456',
    });
    expect(session.systemVars.$session).toEqual({
      scope: '123 456',
      _scope: ['123', '456'],
    });
  });
});

describe('role equivalence', () => {
  it('undefined is equivalent to undefined', () => {
    const result = sessionRolesAreEquivalent(undefined, undefined);
    expect(result).toBe(true);
  });
  // Both amount to "no roles"
  it('undefined and empty array are equivalent', () => {
    {
      const result = sessionRolesAreEquivalent(undefined, []);
      expect(result).toBe(true);
    }
    {
      const result = sessionRolesAreEquivalent([], undefined);
      expect(result).toBe(true);
    }
  });
  it('undefined and non-empty array are not equivalent', () => {
    {
      const result = sessionRolesAreEquivalent(undefined, [
        {
          key: 'a',
          roleVars: {},
        },
      ]);
      expect(result).toBe(true);
    }
    {
      const result = sessionRolesAreEquivalent(
        [
          {
            key: 'a',
            roleVars: {},
          },
        ],
        undefined
      );
      expect(result).toBe(true);
    }
  });
  it('different lengths are not equivalent', () => {
    const result = sessionRolesAreEquivalent(
      [
        {
          key: 'a',
          roleVars: {},
        },
      ],
      [
        {
          key: 'a',
          roleVars: {},
        },
        {
          key: 'b',
          roleVars: {},
        },
      ]
    );
    expect(result).toBe(false);
  });
  it('must both contain the same keys', () => {
    const result = sessionRolesAreEquivalent(
      [
        {
          key: 'a',
          roleVars: {},
        },
        {
          key: 'b',
          roleVars: {},
        },
      ],
      [
        {
          key: 'a',
          roleVars: {},
        },
        {
          key: 'c',
          roleVars: {},
        },
      ]
    );
    expect(result).toBe(false);
  });
  it('matching keys must have the same roleVars', () => {
    // different keys
    {
      const result = sessionRolesAreEquivalent(
        [
          {
            key: 'a',
            roleVars: { a: 1, b: 2 },
          },
        ],
        [
          {
            key: 'a',
            roleVars: { a: 1, c: 3 },
          },
        ]
      );
      expect(result).toBe(false);
    }
    // different values
    {
      const result = sessionRolesAreEquivalent(
        [
          {
            key: 'a',
            roleVars: { a: 1, b: 2 },
          },
        ],
        [
          {
            key: 'a',
            roleVars: { a: 1, b: 3 },
          },
        ]
      );
      expect(result).toBe(false);
    }
    // same objects, different key order
    {
      const result = sessionRolesAreEquivalent(
        [
          {
            key: 'a',
            roleVars: { b: 2, a: 1 },
          },
        ],
        [
          {
            key: 'a',
            roleVars: { a: 1, b: 2 },
          },
        ]
      );
      expect(result).toBe(true);
    }
  });
  it('role order does not matter', () => {
    const result = sessionRolesAreEquivalent(
      [
        {
          key: 'a',
          roleVars: { a: 1, b: 2 },
        },
        {
          key: 'b',
          roleVars: { a: 3, b: 4 },
        },
      ],
      [
        {
          key: 'b',
          roleVars: { a: 3, b: 4 },
        },
        {
          key: 'a',
          roleVars: { a: 1, b: 2 },
        },
      ]
    );
    expect(result).toBe(true);
  });
});

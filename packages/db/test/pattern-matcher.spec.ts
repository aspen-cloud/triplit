import { expect, it } from 'vitest';
import { matchPattern } from '../src/utils/pattern-matcher';

it('returns undefined if pattern is not matched', () => {
  {
    const assignments = matchPattern({ name: 'John' }, { name: 'Doe' });
    expect(assignments).toEqual(undefined);
  }
  {
    const assignments = matchPattern(
      { name: '$name', id: '1' },
      { name: 'Doe', id: '2' }
    );
    expect(assignments).toEqual(undefined);
  }
});

it('returns empty object if no wildcard matches', () => {
  const assignments = matchPattern({ name: 'John' }, { name: 'John' });
  expect(assignments).toEqual({});
});

it('match is successful only if all pattern keys are present', () => {
  {
    const assignments = matchPattern(
      { name: 'John' },
      { name: 'John', address: '123 Main St' }
    );
    expect(assignments).toEqual({});
  }
  {
    const assignments = matchPattern(
      { name: 'John', address: '123 Main St' },
      { name: 'John' }
    );
    expect(assignments).toEqual(undefined);
  }
});

it('parses wildcard properties', () => {
  const assignments = matchPattern(
    { name: '$n', id: '$i', type: 'user' },
    { name: 'John', id: '1', type: 'user' }
  );
  expect(assignments).toEqual({ n: 'John', i: '1' });
});

it('parses wildcard properties inside objects', () => {
  const assignments = matchPattern(
    {
      addresss: {
        city: '$city',
        state: 'NY',
      },
    },
    {
      addresss: {
        street: '123 Main St',
        city: 'New York',
        state: 'NY',
      },
    }
  );
  expect(assignments).toEqual({ city: 'New York' });
});

it('parses wildcard properties inside arrays', () => {
  const assignments = matchPattern(
    {
      items: ['$first', '$second', 3],
    },
    { items: [1, 2, 3] }
  );
  expect(assignments).toEqual({ first: 1, second: 2 });
});

it('can parse arrays or objects as wildcards', () => {
  const assignments = matchPattern(
    {
      items: '$items',
      obj: '$obj',
    },
    { items: [1, 2, 3], obj: { name: 'John' } }
  );
  expect(assignments).toEqual({ items: [1, 2, 3], obj: { name: 'John' } });
});

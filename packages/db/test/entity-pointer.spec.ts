import { expect, it } from 'vitest';
import { EntityPointer } from '../src/query.js';
import { Timestamp } from '../src/timestamp.js';
import { ValuePointer } from '@sinclair/typebox/value';

it('EntityPointer assigns data at paths incrementally', () => {
  const obj = {};
  const TS: Timestamp = [1, 'test'];
  EntityPointer.Set(obj, '/shallow', 1, TS);
  EntityPointer.Set(obj, '/deep', {}, TS);
  EntityPointer.Set(obj, '/deep/a', 1, TS);
  EntityPointer.Set(obj, '/deep/b', 2, TS);

  expect(obj).toEqual({
    shallow: [1, TS],
    deep: [
      {
        a: [1, TS],
        b: [2, TS],
      },
      TS,
    ],
  });
});

it('EntityPointer can assign at arbitrary paths', () => {
  const obj = {};
  const TS: Timestamp = [1, 'test'];
  EntityPointer.Set(obj, '/a/b/c/d', 1, TS);
  expect(obj).toEqual({
    a: [
      {
        b: [
          {
            c: [
              {
                d: [1, TS],
              },
              undefined,
            ],
          },
          undefined,
        ],
      },
      undefined,
    ],
  });
});

it('EntityPointer can overwrite child data', () => {
  const obj = {};
  const TS: Timestamp = [1, 'test'];
  EntityPointer.Set(obj, '/a/b/c/d', 1, TS);
  EntityPointer.Set(obj, '/a/b', 2, TS);
  expect(obj).toEqual({
    a: [
      {
        b: [2, TS],
      },
      undefined,
    ],
  });
});

// This is a weird special case
it('EntityPointer will ignore deep undefined assignments', () => {
  const obj = {};
  const TS: Timestamp = [1, 'test'];
  EntityPointer.Set(obj, '/a/b', undefined, TS);
  EntityPointer.Set(obj, '/a/b/c', undefined, TS);
  expect(obj).toEqual({
    a: [
      {
        b: [undefined, TS],
      },
      undefined,
    ],
  });
});

it('EntityPointer gets data at paths', () => {
  const obj = {};
  const TS: Timestamp = [1, 'test'];
  EntityPointer.Set(obj, '/a', 1, TS);
  EntityPointer.Set(obj, '/b', 2, TS);
  EntityPointer.Set(obj, '/c', {}, TS);
  EntityPointer.Set(obj, '/c/d', 3, TS);
  EntityPointer.Set(obj, '/c/e', 4, TS);
  expect(EntityPointer.Get(obj, '/a')).toEqual([1, TS]);
  expect(EntityPointer.Get(obj, '/b')).toEqual([2, TS]);
  expect(EntityPointer.Get(obj, '/c')).toEqual([
    {
      d: [3, TS],
      e: [4, TS],
    },
    TS,
  ]);
  expect(EntityPointer.Get(obj, '/c/d')).toEqual([3, TS]);
  expect(EntityPointer.Get(obj, '/c/e')).toEqual([4, TS]);
  expect(EntityPointer.Get(obj, '/DNE')).toBeUndefined();
  expect(EntityPointer.Get(obj, '/c/DNE')).toBeUndefined();
  expect(EntityPointer.Get(obj, '/DNE/DNE')).toBeUndefined();
});

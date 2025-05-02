import { expect, it } from 'vitest';
import { ValuePointer } from '../src/index.ts';

it('can traverse into array paths', () => {
  const data = {
    attr: [
      { a: 1, b: 2 },
      { a: 3, b: 4 },
      { a: [{ c: 5 }], b: 6 },
    ],
  };
  expect(ValuePointer.Get(data, 'attr.0.a')).toEqual(1);
  expect(ValuePointer.Get(data, 'attr.1.a')).toEqual(3);
  expect(ValuePointer.Get(data, 'attr.2.a.0.c')).toEqual(5);
  expect(ValuePointer.Get(data, 'attr.3')).toEqual(undefined);
  expect(ValuePointer.Get(data, 'attr.3.a')).toEqual(undefined);
});

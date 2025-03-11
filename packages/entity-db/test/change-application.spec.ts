import { describe, expect, it } from 'vitest';
import { applyOverlay } from '../src/overlay-change-buffer.ts';
const cases: [
  Record<string, any> | undefined,
  boolean,
  Record<string, any> | undefined,
  Record<string, any> | undefined,
][] = [
  [{ id: '1', name: 'Matt' }, false, undefined, { id: '1', name: 'Matt' }],
  [{ id: '1', name: 'Matt' }, true, undefined, undefined],
  [{ id: '1', name: 'Matt' }, false, { name: 'Bob' }, { id: '1', name: 'Bob' }],
  [
    { id: '1', name: 'Matt' },
    true,
    { id: '2', name: 'Bob' },
    { id: '2', name: 'Bob' },
  ],
  [undefined, true, { id: '2', name: 'Bob' }, { id: '2', name: 'Bob' }],
  [undefined, false, { id: '2', name: 'Bob' }, { id: '2', name: 'Bob' }],
  [undefined, false, undefined, undefined],
  [undefined, true, undefined, undefined],
];

describe.each(cases)('applyOverlay', (primary, hasDelete, update, expected) => {
  it(`should return ${JSON.stringify(expected)}`, () => {
    expect(applyOverlay(primary, hasDelete, update)).toEqual(expected);
  });
});

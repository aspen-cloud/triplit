import { createUpdateProxyAndTrackChanges } from '../src/db-transaction.js';
import { beforeEach, describe, expect, it } from 'vitest';

describe('createUpdateProxyAndTrackChanges', () => {
  let proxy: any;
  let changes: any;
  let original: any;
  beforeEach(() => {
    changes = {};
    original = { a: 1, b: 2, c: { d: 3 } };
    proxy = createUpdateProxyAndTrackChanges(original, changes);
  });

  it('can read properties', () => {
    expect(proxy.a).toBe(1);
    expect(proxy.b).toBe(2);
    expect(proxy.c.d).toBe(3);
  });

  it('can set properties', () => {
    proxy.a = 4;
    expect(proxy.a).toBe(4);
    expect(changes).toEqual({ a: 4 });
  });

  it('can set nested properties', () => {
    proxy.c.d = 5;
    expect(proxy.c.d).toBe(5);
    expect(changes).toEqual({ c: { d: 5 } });
  });

  it('can delete properties', () => {
    delete proxy.a;
    expect(proxy.a).toBe(null);
    expect(changes).toEqual({ a: null });
    expect(proxy).toEqual({ a: null, b: 2, c: { d: 3 } });
  });

  it('can set multiple changes', () => {
    proxy.a = 4;
    proxy.c.d = 5;
    expect(proxy).toEqual({ a: 4, b: 2, c: { d: 5 } });
  });
});

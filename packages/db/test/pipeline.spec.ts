import { describe, expect, it, beforeEach, beforeAll, vi } from 'vitest';
import { Pipeline } from '../src/utils/pipeline';

const numbers = [1, 2, 3, 4, 5];

describe('first', () => {
  it('can create a pipeline', () => {
    const pipe = new Pipeline(numbers);
    expect(pipe).toBeDefined();
  });
  it('can map', async () => {
    const pipe = new Pipeline(numbers);
    const mapped = await pipe.map(async (x) => x * 2).toArray();
    expect(mapped).toEqual([2, 4, 6, 8, 10]);
  });
  it('can filter', async () => {
    const pipe = new Pipeline(numbers);
    const filtered = await pipe.filter(async (x) => x % 2 === 0).toArray();
    expect(filtered).toEqual([2, 4]);
  });
  it('can tap', async () => {
    const pipe = new Pipeline(numbers);
    const tapped = [];
    const result = await pipe
      .tap(async (x) => {
        tapped.push(x);
      })
      .toArray();
    expect(tapped).toEqual(numbers);
    expect(result).toEqual(numbers);
  });
  it('can take', async () => {
    const pipe = new Pipeline(numbers);
    const result = await pipe.take(2).toArray();
    expect(result).toEqual([1, 2]);
  });
  it('can string together all the methods', async () => {
    const pipe = new Pipeline(numbers);
    const result = await pipe
      .map(async (x) => x * 2)
      .filter(async (x) => x % 4 === 0)
      .take(2)
      .toArray();
    expect(result).toEqual([4, 8]);
  });
});

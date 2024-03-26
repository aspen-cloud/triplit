import { describe, expect, it, beforeEach, beforeAll, vi } from 'vitest';
import { Pipeline } from '../src/utils/pipeline.js';

describe('first', () => {
  let numbers: number[];
  // Start with a fresh array of numbers before each test in case we modify it
  beforeEach(() => {
    numbers = [1, 2, 3, 4, 5];
  });

  it('can create a pipeline', () => {
    const pipe = new Pipeline();
    expect(pipe).toBeDefined();
  });
  it('can map', async () => {
    const pipe = new Pipeline<number>();
    const mapped = await pipe.map(async (x) => x * 2).run(numbers);
    expect(mapped).toEqual([2, 4, 6, 8, 10]);
  });
  it('can filter', async () => {
    const pipe = new Pipeline<number>();
    const filtered = await pipe.filter(async (x) => x % 2 === 0).run(numbers);
    expect(filtered).toEqual([2, 4]);
  });
  it('can tap', async () => {
    const expected = [...numbers];
    const pipe = new Pipeline<number>();
    const tapped: number[] = [];
    const result = await pipe
      .tap(async (x) => {
        tapped.push(x);
      })
      .run(numbers);

    expect(tapped).toEqual(expected);
    expect(result).toEqual(expected);
  });
  it('can take', async () => {
    const pipe = new Pipeline();
    const result = await pipe.take(2).run(numbers);
    expect(result).toEqual([1, 2]);
  });
  it('can sort', async () => {
    const pipe = new Pipeline<number>();
    const result = await pipe.sort((a, b) => b - a).run(numbers);
    expect(result).toEqual([5, 4, 3, 2, 1]);
  });
  it('can string together all the methods', async () => {
    const pipe = new Pipeline<number>();
    const result = await pipe
      .map(async (x) => x * 2)
      .filter(async (x) => x % 4 === 0)
      .sort((a, b) => b - a)
      .take(2)
      .run(numbers);
    expect(result).toEqual([8, 4]);
  });
});

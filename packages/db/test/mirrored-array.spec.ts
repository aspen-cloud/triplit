import { expect, describe, it } from 'vitest';
import { MirroredArray } from '../src/utils/mirrored-array.js';

describe('MirroredArray', () => {
  it('should return the correct value at a given index', () => {
    const arr1 = [1, 2, 3];
    const arr2 = [4, 5, 6];
    const mirroredArray = MirroredArray(arr1, arr2);

    expect(mirroredArray[0]).toBe(1);
    expect(mirroredArray[1]).toBe(2);
    expect(mirroredArray[2]).toBe(3);
    expect(mirroredArray[3]).toBe(4);
    expect(mirroredArray[4]).toBe(5);
    expect(mirroredArray[5]).toBe(6);
  });

  it('should return the correct length', () => {
    const arr1 = [1, 2, 3];
    const arr2 = [4, 5, 6];
    const mirroredArray = MirroredArray(arr1, arr2);

    expect(mirroredArray.length).toBe(6);
  });

  describe('built in array methods', () => {
    it('should correctly iterate over the elements using forEach', () => {
      const arr1 = [1, 2, 3];
      const arr2 = [4, 5, 6];
      const mirroredArray = MirroredArray(arr1, arr2);
      const result: number[] = [];
      mirroredArray.forEach((value) => {
        result.push(value);
      });
      expect(result).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should correctly map the elements using map', () => {
      const arr1 = [1, 2, 3];
      const arr2 = [4, 5, 6];
      const mirroredArray = MirroredArray(arr1, arr2);
      const mappedArray = mirroredArray.map((value) => value * 2);
      expect(mappedArray).toEqual([2, 4, 6, 8, 10, 12]);
    });

    it('should correctly filter the elements using filter', () => {
      const arr1 = [1, 2, 3];
      const arr2 = [4, 5, 6];
      const mirroredArray = MirroredArray(arr1, arr2);
      const filteredArray = mirroredArray.filter((value) => value % 2 === 0);
      expect(filteredArray).toEqual([2, 4, 6]);
    });

    it('should correctly reduce the elements using reduce', () => {
      const arr1 = [1, 2, 3];
      const arr2 = [4, 5, 6];
      const mirroredArray = MirroredArray(arr1, arr2);
      const reducedValue = mirroredArray.reduce((acc, value) => acc + value, 0);
      expect(reducedValue).toBe(21);
    });
  });
});

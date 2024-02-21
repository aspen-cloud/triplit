import { describe, expect, it, beforeEach, beforeAll, vi } from 'vitest';
import { generateQueryRootPermutations } from '../src/collection-query.js';

describe('query root permutations', () => {
  it('can generate a permutation for each subquery filter', () => {
    const query = {
      collectionName: 'manufacturers',
      where: [
        {
          exists: {
            collectionName: 'cars',
            where: [
              ['type', '=', 'SUV'],
              ['manufacturer', '=', '$id'],
            ],
          },
        },
      ],
    };
    const permutations = generateQueryRootPermutations<any, any>(query);
    prettyPrint(permutations);
    expect(permutations).toHaveLength(2);
  });
});

function prettyPrint(obj: any) {
  return console.log(
    JSON.stringify(
      obj,
      (key, value) => {
        if (Array.isArray(value) && value.every((v) => typeof v !== 'object')) {
          // Convert array to a JSON string with no spacing for indentation
          //   return o value.join(', ') + ']';
          return value;
        }
        return value; // Return non-array values unchanged
      },
      2
    )
  );
}

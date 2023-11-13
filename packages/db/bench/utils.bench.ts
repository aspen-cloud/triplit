import { describe, bench } from 'vitest';
import { dbDocumentToTuples } from '../src/utils.js';

const testObject = {
  name: 'test',
  scores: [
    { name: 'a', count: 1 },
    { name: 'b', count: 2 },
    { name: 'c', count: 3 },
  ],
};

let arr = [];

describe('Document performance', () => {
  bench('object to tuples', () => {
    dbDocumentToTuples(testObject);
  });

  bench('json stringify', () => {
    JSON.stringify(testObject);
  });
});

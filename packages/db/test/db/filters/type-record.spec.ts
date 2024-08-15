import { it, expect, describe } from 'vitest';
import { Schema as S } from '../../../src/schema/builder.js';

// If this fails, add tests for the missing operations
it('expected operations are tested', () => {
  expect(new Set(S.Record({}).supportedOperations)).toEqual(new Set([]));
});

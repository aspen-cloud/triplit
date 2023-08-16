import { describe, expect, it, beforeEach, beforeAll, vi } from 'vitest';
import { Schema as S, getSchemaFromPath } from '../src/schema';

describe('Schema', () => {
  const StudentSchema = S.Schema({
    name: S.string(),
    classes: S.Set(S.string()),
    graduationYear: S.number(),
  });
  it('should prevent an invalid accession in a schema', () => {
    expect(() => getSchemaFromPath(StudentSchema, ['grade', 'foo'])).toThrow();
    expect(() => getSchemaFromPath(S.string(), ['name'])).toThrow();
  });
  it('should only allow strings and numbers as set types', () => {
    expect(() => S.Set(S.number())).not.toThrowError();
    expect(() => S.Set(S.string())).not.toThrowError();
    expect(() => S.Set(S.Boolean())).toThrowError();
    expect(() => S.Set(S.Set())).toThrowError();
    expect(() => S.Set(S.Schema())).toThrowError();
  });
});

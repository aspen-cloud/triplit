import { describe, expect, it } from 'vitest';
import { Schema as S, getSchemaFromPath } from '../src/schema';

describe('Schema', () => {
  const StudentSchema = S.Schema({
    name: S.String(),
    classes: S.Set(S.String()),
    graduationYear: S.Number(),
  });
  it('should prevent an invalid accession in a schema', () => {
    expect(() => getSchemaFromPath(StudentSchema, ['grade', 'foo'])).toThrow();
    expect(() => getSchemaFromPath(S.String(), ['name'])).toThrow();
  });
  it('should only allow strings and numbers as set types', () => {
    expect(() => S.Set(S.Number())).not.toThrowError();
    expect(() => S.Set(S.String())).not.toThrowError();
    expect(() => S.Set(S.Boolean())).toThrowError();
    expect(() => S.Set(S.Set())).toThrowError();
    expect(() => S.Set(S.Schema())).toThrowError();
  });
});

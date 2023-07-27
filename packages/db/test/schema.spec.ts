import { describe, expect, it, beforeEach, beforeAll, vi } from 'vitest';
import * as S from '../src/schema';

describe('Schema', () => {
  const StudentSchema = S.Schema({
    name: S.string(),
    classes: S.Set(S.string()),
    graduationYear: S.number(),
  });
  it('should prevent an invalid accession in a schema', () => {
    expect(() =>
      S.getSchemaFromPath(StudentSchema, ['grade', 'foo'])
    ).toThrow();
    expect(() =>
      S.getSchemaFromPath(S.Register(S.string()), ['name'])
    ).toThrow();
  });
  it('should only allow strings and numbers as set types', () => {
    expect(() => S.Set(S.number())).not.toThrowError();
    expect(() => S.Set(S.string())).not.toThrowError();
    expect(() => S.Set(S.Boolean())).toThrowError();
    expect(() => S.Set(S.Set())).toThrowError();
    expect(() => S.Set(S.Schema())).toThrowError();
  });
});

import { describe, expect, it } from 'vitest';
import { Schema as S, getSchemaFromPath } from '../src/schema';
import { InvalidSchemaPathError } from '../src';

describe('Schema', () => {
  const StudentSchema = S.Schema({
    name: S.String(),
    classes: S.Set(S.String()),
    graduationYear: S.Number(),
  });
  it('should prevent an invalid accession in a schema', () => {
    expect(() => getSchemaFromPath(StudentSchema, ['grade', 'foo'])).toThrow(
      InvalidSchemaPathError
    );
  });
  it('should only allow value types as set types', () => {
    expect(() => S.Schema({ foo: S.Set(S.Number()) })).not.toThrowError();
    expect(() => S.Schema({ foo: S.Set(S.String()) })).not.toThrowError();
    expect(() => S.Schema({ foo: S.Set(S.Boolean()) })).not.toThrowError();
    expect(() => S.Schema({ foo: S.Set(S.Date()) })).not.toThrowError();
    expect(() => S.Schema({ foo: S.Set(S.Set()) })).toThrowError();
    expect(() => S.Schema({ foo: S.Set(S.Schema()) })).toThrowError();
  });
});

import { it } from 'vitest';
import { Schema as S } from '../src/schema/builder.js';
import { Type } from '../src/schema/index.js';

it.todo('test', () => {
  const schema = S.Schema({
    id: S.Id(),
    set: S.Set(S.String()),
  });
  const a = Type.struct(schema);
  console.dir(a, { depth: null });
  const b = Type.assign(schema, a, { id: 'test', set: new Set(['set']) });
  console.dir(b, { depth: null });
  const c = Type.encode(schema, b);
  console.dir(c, { depth: null });
  const d = Type.serialize(
    schema,
    { id: 'test', set: new Set(['set']) },
    'decoded'
  );
  console.dir(d, { depth: null });
  const e = Type.deserialize(schema, d, 'decoded');
  console.dir(e, { depth: null });
});

it.todo('test2', () => {
  const item = {
    id: 'test1',
    string: 'string',
    number: 42,
    boolean: true,
    date: '2022-11-15T08:00:00.000Z',
    set: ['set'],
    record: {
      string: 'string',
      number: 42,
      boolean: true,
      date: '2022-11-15T08:00:00.000Z',
    },
    nullableString: null,
    nullableNumber: null,
    nullableBoolean: null,
    nullableDate: null,
    nullableSet: null,
    defaultString: 'default',
    defaultNumber: 42,
    defaultBoolean: true,
    defaultDate: '2022-11-15T08:00:00.000Z',
  };

  const schema = S.Collections({
    test: {
      schema: S.Schema({
        id: S.Id(),
        string: S.String(),
        number: S.Number(),
        boolean: S.Boolean(),
        date: S.Date(),
        set: S.Set(S.String()),
        record: S.Record({
          string: S.String(),
          number: S.Number(),
          boolean: S.Boolean(),
          date: S.Date(),
        }),
        nullableString: S.String({ nullable: true }),
        nullableNumber: S.Number({ nullable: true }),
        nullableBoolean: S.Boolean({ nullable: true }),
        nullableDate: S.Date({ nullable: true }),
        nullableSet: S.Set(S.String(), { nullable: true }),
        defaultString: S.String({ default: 'default' }),
        defaultNumber: S.Number({ default: 42 }),
        defaultBoolean: S.Boolean({ default: true }),
        defaultDate: S.Date({ default: new Date(2022, 10, 15).toISOString() }),
        defaultNullString: S.String({ default: null, nullable: true }),
        defaultNullNumber: S.Number({ default: null, nullable: true }),
        defaultNullBoolean: S.Boolean({ default: null, nullable: true }),
        defaultNullDate: S.Date({ default: null, nullable: true }),
      }),
    },
  });

  const res = Type.deserialize(schema.test.schema, item, 'decoded');
  console.dir(res, { depth: null });
});

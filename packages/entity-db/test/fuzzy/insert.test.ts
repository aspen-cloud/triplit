import { test, fc } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import { AssertionError } from 'chai';
import { DB } from '../../src/db.js';
import { Schema as S } from '../../src/schema/builder.js';
import { TriplitError } from '../../src/errors.js';

describe('inserts', () => {
  const db = new DB({
    schema: {
      collections: {
        stressTest: {
          schema: S.Schema({
            id: S.Id(),
            string: S.String(),
            number: S.Number(),
            boolean: S.Boolean(),
            date: S.Date(),
            stringSet: S.Set(S.String()),
            numberSet: S.Set(S.Number()),
            booleanSet: S.Set(S.Boolean()),
            dateSet: S.Set(S.Date()),
            record: S.Record({}),
            recordWithKeys: S.Record({
              string: S.String(),
              number: S.Number(),
              boolean: S.Boolean(),
              date: S.Date(),
            }),
            optionalString: S.Optional(S.String()),
            optionalNumber: S.Optional(S.Number()),
            optionalBoolean: S.Optional(S.Boolean()),
            optionalDate: S.Optional(S.Date()),
            optionalStringSet: S.Optional(S.Set(S.String())),
            optionalNumberSet: S.Optional(S.Set(S.Number())),
            optionalBooleanSet: S.Optional(S.Set(S.Boolean())),
            optionalDateSet: S.Optional(S.Set(S.Date())),
            optionalRecord: S.Optional(S.Record({})),
            nullableString: S.String({ nullable: true }),
            nullableNumber: S.Number({ nullable: true }),
            nullableBoolean: S.Boolean({ nullable: true }),
            nullableDate: S.Date({ nullable: true }),
            nullableStringSet: S.Set(S.String(), { nullable: true }),
            nullableNumberSet: S.Set(S.Number(), { nullable: true }),
            nullableBooleanSet: S.Set(S.Boolean(), { nullable: true }),
            nullableDateSet: S.Set(S.Date(), { nullable: true }),
          }),
        },
      },
    },
  });

  test.prop([
    fc.record(
      {
        // id: fc.string({ minLength: 1 }),
        string: fc.string(),
        number: fc.integer(),
        boolean: fc.boolean(),
        date: fc.date({ noInvalidDate: true }),
        stringSet: fc.uniqueArray(fc.string()),
        numberSet: fc.uniqueArray(fc.integer()),
        booleanSet: fc.uniqueArray(fc.boolean()),
        dateSet: fc.uniqueArray(fc.date({ noInvalidDate: true })),
        record: fc.record({}),
        recordWithKeys: fc.record({
          string: fc.string(),
          number: fc.integer(),
          boolean: fc.boolean(),
          date: fc.date({ noInvalidDate: true }),
        }),
        optionalString: fc.string(),
        optionalNumber: fc.integer(),
        optionalBoolean: fc.boolean(),
        optionalDate: fc.date({ noInvalidDate: true }),
        optionalStringSet: fc.uniqueArray(fc.string()),
        optionalNumberSet: fc.uniqueArray(fc.integer()),
        optionalBooleanSet: fc.uniqueArray(fc.boolean()),
        optionalDateSet: fc.uniqueArray(
          fc.date({ noInvalidDate: true, min: new Date() })
        ),
        optionalRecord: fc.record({}),

        nullableString: fc.option(fc.string(), { nil: null }),
        nullableNumber: fc.option(fc.integer(), { nil: null }),
        nullableBoolean: fc.option(fc.boolean(), { nil: null }),
        nullableDate: fc.option(fc.date({ noInvalidDate: true }), {
          nil: null,
        }),
        nullableStringSet: fc.option(fc.uniqueArray(fc.string()), {
          nil: null,
        }),
        nullableNumberSet: fc.option(fc.uniqueArray(fc.integer()), {
          nil: null,
        }),
        nullableBooleanSet: fc.option(fc.uniqueArray(fc.boolean()), {
          nil: null,
        }),
        nullableDateSet: fc.option(
          fc.uniqueArray(fc.date({ noInvalidDate: true })),
          { nil: null }
        ),
      },
      {
        requiredKeys: [
          // 'id',
          'string',
          'number',
          'boolean',
          'date',
          'stringSet',
          'numberSet',
          'booleanSet',
          'dateSet',
          'record',
          'recordWithKeys',
          'nullableString',
          'nullableNumber',
          'nullableBoolean',
          'nullableDate',
          'nullableStringSet',
          'nullableNumberSet',
          'nullableBooleanSet',
          'nullableDateSet',
        ],
      }
    ),
  ])('should insert a record', async (ent) => {
    try {
      const resp = await db.insert('stressTest', ent);
      const fetchedEnt = await db.fetchById('stressTest', resp.id);
      expect(fetchedEnt).not.toBeNull();
      const insertedEnt = turnObjectArraysToSet({ ...ent, id: resp.id });
      try {
        // expect(insertedEnt).toEqual(fetchedEnt);
      } catch (e) {
        console.log({ inserted: insertedEnt, fetched: fetchedEnt });
        const diffs = compareObjs(insertedEnt, fetchedEnt);
        if (diffs.size > 0) {
          console.log('diffs', Array.from(diffs.entries()));
        }
        throw e;
      }
    } catch (e) {
      if (e instanceof AssertionError) {
        throw e;
      }
      if (!(e instanceof TriplitError)) {
        console.error('bad error', e, ent);
        // console.log('ent', ent);
      }
      expect(e).toBeInstanceOf(TriplitError);
    }
  });
});

function turnObjectArraysToSet(obj) {
  for (let key in obj) {
    if (obj[key] instanceof Array) {
      obj[key] = new Set(obj[key]);
    } else if (typeof obj[key] === 'object') {
      turnObjectArraysToSet(obj[key]);
    }
  }
  return obj;
}

function compareObjs(a, b, prefix = '', diffs = new Map()) {
  for (let key in a) {
    if (typeof a[key] === 'object') {
      compareObjs(a[key], b[key], prefix + key + '.', diffs);
    } else {
      if (a[key] !== b[key]) {
        diffs.set(prefix + key, [a[key], b[key]]);
      }
    }
  }
  return diffs;
}

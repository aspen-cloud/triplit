import { describe, expect, it, beforeEach, beforeAll, vi } from 'vitest';
import { diffSchemas, getDangerousEdits, Schema as S } from '../src/schema.js';
import DB from '../src/index.js';

function wrapSchema(definition: any) {
  return {
    version: 0,
    collections: { stressTest: { schema: S.Schema(definition) } },
  };
}

const stressTest = {
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
};

const changed = { ...stressTest };
// setting a nullable to non-nullable DANGEROUS
changed.nullableDate = S.Date();

// setting nullable and adding a default SAFE
changed.date = S.Date({ nullable: true, default: S.Default.now() });

// making something optional non-optional DANGEROUS
changed.optionalBoolean = S.Boolean();

// making something non-optional, optional SAFE
changed.boolean = S.Optional(S.Boolean());

// changing a type DANGEROUS
changed.number = S.Set(S.Number());

// changing a sets item type DANGEROUS
changed.booleanSet = S.Set(S.Number());

// changing a record item's type DANGEROUS
changed.recordWithKeys = S.Record({
  string: S.Number(),
  number: S.Number(),
  boolean: S.Boolean(),
  date: S.Date(),
});

// added an attribute that's not optional, DANGEROUS
changed.new = S.String();

// added an attribute that's optional, SAFE
changed.optionalNew = S.Optional(S.String());

// deleting an attribute DANGEROUS
delete changed.record;

const stressTestSchema = wrapSchema(stressTest);

describe('Schema diffing', () => {
  it('can diff a big schema', () => {
    const result = diffSchemas(stressTestSchema, stressTestSchema);
    expect(result.length).toBe(0);
  });
  it('can diff a missing attribute', () => {
    const lackingAnAttribute = { ...stressTest };
    delete lackingAnAttribute.id;
    const result = diffSchemas(
      stressTestSchema,
      wrapSchema(lackingAnAttribute)
    );
    expect(result).toStrictEqual([
      { collection: 'stressTest', type: 'delete', attribute: ['id'] },
    ]);
    const reverseResult = diffSchemas(
      wrapSchema(lackingAnAttribute),
      stressTestSchema
    );
    expect(reverseResult).toStrictEqual([
      {
        collection: 'stressTest',
        type: 'insert',
        attribute: ['id'],
        metadata: {
          type: 'string',
          options: { nullable: false, default: { args: null, func: 'uuid' } },
          optional: false,
        },
      },
    ]);
  });
  it('can diff multiple changed attributes', () => {
    const noAttributes = {};
    const result = diffSchemas(stressTestSchema, wrapSchema(noAttributes));
    for (const res of result) {
      expect(stressTest[res.attribute[0]]).toBeTruthy();
      expect(res.collection).toBe('stressTest');
      expect(res.type).toStrictEqual('delete');
    }
    expect(result.length).toBe(Object.keys(stressTest).length);
    const reverseResult = diffSchemas(
      wrapSchema(noAttributes),
      stressTestSchema
    );
    expect(reverseResult.length).toBe(Object.keys(stressTest).length);
    for (const res of reverseResult) {
      expect(stressTest[res.attribute[0]]).toBeTruthy();
      expect(res.collection).toBe('stressTest');
      expect(res.type).toStrictEqual('insert');
    }
  });
  it('can diff changed optional / not optional changes', () => {
    const result = diffSchemas(stressTestSchema, wrapSchema(changed));
    const resultsMap = result.reduce((prev, curr) => {
      return { ...prev, [curr.attribute[0]]: curr };
    }, {});
    expect(resultsMap.number.changes.type).toBe('set');
    expect(resultsMap.boolean.changes.optional).toBe(true);
    expect(resultsMap.optionalBoolean.changes.optional).toBe(false);
    expect(resultsMap.nullableDate.changes.options.nullable).toBe(false);
    expect(resultsMap.date.changes.options).toStrictEqual({
      nullable: true,
      default: S.Default.now(),
    });
  });
  it('can diff schemas with different collections', () => {
    const schemaA = {
      version: 0,
      collections: { first: { schema: S.Schema({ id: S.Id() }) } },
    };
    const schemaB = {
      version: 0,
      collections: {
        first: { schema: S.Schema({ id: S.Id() }) },
        second: { schema: S.Schema({ id: S.Id() }) },
      },
    };
    const diff = diffSchemas(schemaB, schemaA);
    expect(diff).toStrictEqual([
      { collection: 'second', type: 'delete', attribute: ['id'] },
    ]);
    const reverseDiff = diffSchemas(schemaA, schemaB);
    expect(reverseDiff).toStrictEqual([
      {
        collection: 'second',
        type: 'insert',
        attribute: ['id'],
        metadata: {
          type: 'string',
          options: { nullable: false, default: { args: null, func: 'uuid' } },
          optional: false,
        },
      },
    ]);
  });
});

describe('detecting dangerous edits', () => {
  it('can detect dangerous edits', () => {
    const destructiveEdits = getDangerousEdits(
      diffSchemas(stressTestSchema, wrapSchema(changed))
    );
    const attributesChangedDangerously = new Set([
      'number',
      'optionalBoolean',
      'nullableDate',
      'booleanSet',
      'recordWithKeys',
      'new',
      'record',
    ]);
    for (const edit of destructiveEdits) {
      expect(attributesChangedDangerously.has(edit.context.attribute[0])).toBe(
        true
      );
    }
    expect(destructiveEdits.length).toBe(7);
  });
  it('can evaluate if an edit is permissible based on the state of the database', async () => {});
});

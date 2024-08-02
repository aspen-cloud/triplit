import { Schema as S } from '../../src/schema/builder.js';

// Want to figure out the best way to test various data types + operation combos
// Right now im reusing this exhaustive schema (also defined in cli tests)
export const EXHAUSTIVE_SCHEMA = {
  collections: {
    test: {
      schema: S.Schema({
        id: S.Id(),
        // value types
        string: S.String(),
        boolean: S.Boolean(),
        number: S.Number(),
        date: S.Date(),
        // enum string
        enumString: S.String({ enum: ['a', 'b', 'c'] as const }),
        // set type
        setString: S.Set(S.String()),
        setNumber: S.Set(S.Number()),
        nullableSet: S.Set(S.String(), {
          nullable: true,
        }),
        // record type
        record: S.Record({
          attr1: S.String(),
          attr2: S.String(),
          attr3: S.Optional(S.String()),
        }),
        // optional
        optional: S.Optional(S.String()),
        // nullable
        nullableFalse: S.String({ nullable: false }),
        nullableTrue: S.String({ nullable: true }),
        // default values
        defaultValue: S.String({ default: 'default' }),
        defaultNull: S.String({ default: null, nullable: true }),
        // default functions
        defaultNow: S.String({ default: S.Default.now() }),
        defaultUuid: S.String({ default: S.Default.uuid() }),
        // subqueries
        subquery: S.Query({ collectionName: 'test2' as const, where: [] }),
        // relations
        relationOne: S.RelationOne('test2', { where: [] }),
        relationMany: S.RelationMany('test3', { where: [] }),
        relationById: S.RelationById('test4', 'test-id'),
      }),
    },
    test2: {
      schema: S.Schema({
        id: S.Id(),
        test2Data: S.String(),
        test3: S.RelationById('test3', 'test-id'),
        test4: S.RelationById('test4', 'test-id'),
      }),
    },
    test3: {
      schema: S.Schema({
        id: S.Id(),
        test3Data: S.String(),
        test4: S.RelationById('test4', 'test-id'),
      }),
    },
    test4: {
      schema: S.Schema({
        id: S.Id(),
        test4Data: S.String(),
      }),
    },
  },
};

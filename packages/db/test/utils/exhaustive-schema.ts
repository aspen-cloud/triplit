import { Schema as S } from '../../src/schema/builder.js';

// Want to figure out the best way to test various data types + operation combos
// Right now im reusing this exhaustive schema (also defined in cli tests)
export const EXHAUSTIVE_SCHEMA = {
  collections: S.Collections({
    test: {
      schema: S.Schema({
        id: S.Id(),
        // boolean
        boolean: S.Boolean(),
        nullableBoolean: S.Boolean({ nullable: true }),
        optionalBoolean: S.Optional(S.Boolean()),
        defaultBoolean: S.Boolean({ default: true }),

        // // date
        date: S.Date(),
        nullableDate: S.Date({ nullable: true }),
        optionalDate: S.Optional(S.Date()),
        defaultDate: S.Date({ default: S.Default.now() }),

        // number
        number: S.Number(),
        nullableNumber: S.Number({ nullable: true }),
        optionalNumber: S.Optional(S.Number()),
        defaultNumber: S.Number({ default: 1 }),

        // record
        record: S.Record({
          attr1: S.String(),
          attr2: S.Number(),
          nullable: S.String({ nullable: true }),
          optional: S.Optional(S.String()),
        }),
        nullableRecord: S.Record(
          {
            attr1: S.String(),
            attr2: S.Number(),
          },
          { nullable: true }
        ),
        optionalRecord: S.Optional(
          S.Record({
            attr1: S.String(),
            attr2: S.Number(),
          })
        ),
        // TODO: record defaults

        // Set
        setBoolean: S.Set(S.Boolean()),
        setDate: S.Set(S.Date()),
        setNumber: S.Set(S.Number()),
        setString: S.Set(S.String()),
        nullableSet: S.Set(S.String(), {
          nullable: true,
        }),
        optionalSet: S.Optional(S.Set(S.String())),
        // // TODO: set defaults

        // string
        string: S.String(),
        nullableString: S.String({ nullable: true }),
        optionalString: S.Optional(S.String()),
        defaultString: S.String({ default: 'default' }),
        enumString: S.String({ enum: ['a', 'b', 'c'] }),
        nullableEnumString: S.String({
          enum: ['a', 'b', 'c'],
          nullable: true,
        }),
      }),
      relationships: {
        subquery: {
          query: {
            collectionName: 'test2',
            where: [],
          },
          cardinality: 'many',
        },
        relationOne: S.RelationOne('test2', { where: [] }),
        relationMany: S.RelationMany('test3', { where: [] }),
        relationById: S.RelationById('test4', 'test-id'),
      },
    },
    test2: {
      schema: S.Schema({
        id: S.Id(),
        test2Data: S.String(),
      }),
      relationships: {
        test3: S.RelationById('test3', 'test-id'),
        test4: S.RelationById('test4', 'test-id'),
      },
    },
    test3: {
      schema: S.Schema({
        id: S.Id(),
        test3Data: S.String(),
      }),
      relationships: {
        test4: S.RelationById('test4', 'test-id'),
      },
    },
    test4: {
      schema: S.Schema({
        id: S.Id(),
        test4Data: S.String(),
      }),
    },
  }),
};

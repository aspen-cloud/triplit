import { describe, expect, it } from 'vitest';
import { Schema as S } from '../src/schema/builder.js';
import {
  createSchemaIterator,
  createSchemaTraverser,
  getSchemaFromPath,
} from '../src/schema/schema.js';
import {
  CollectionNotFoundError,
  DBSerializationError,
  InvalidQueryCardinalityError,
  InvalidSchemaOptionsError,
  InvalidSchemaPathError,
  JSONValueParseError,
  MalformedSchemaError,
  TriplitError,
} from '../src/errors.js';
import DB from '../src/db.js';

/**
 * Sort of speccing out value type tests here
 * String is very similar to number, others
 * Date, Set, and Query are more unique
 *
 * TODO: add more tests for other types (especially record)
 */
describe('S.String', () => {
  describe('convertInputToDBValue', () => {
    it('properly converts string inputs', () => {
      expect(() => S.String().validateInput('foo')).not.toThrow();
      expect(() => S.String().validateInput('')).not.toThrow();
    });
    it('throws error if value is not a string', () => {
      expect(() => S.String().convertInputToDBValue(1)).toThrowError(
        DBSerializationError
      );
    });
    it('allows null only if nullable is true', () => {
      expect(() => S.String().convertInputToDBValue(null)).toThrowError(
        DBSerializationError
      );
      expect(() =>
        S.String({ nullable: true }).convertInputToDBValue(null)
      ).not.toThrow();
    });
  });

  describe('convertDBValueToJS', () => {
    it('returns values as is', () => {
      expect(S.String().convertDBValueToJS('foo')).toBe('foo');
      expect(S.String().convertDBValueToJS('')).toBe('');
      expect(S.String({ nullable: true }).convertDBValueToJS(null)).toBe(null);
    });
  });

  describe('convertJSONToJS', () => {
    it('properly converts string inputs', () => {
      expect(S.String().convertJSONToJS('foo')).toBe('foo');
      expect(S.String().convertJSONToJS('')).toBe('');
    });
    it('throws error if value is not a string', () => {
      expect(() => S.String().convertJSONToJS(1)).toThrowError(
        JSONValueParseError
      );
    });
    it('allows null only if nullable is true', () => {
      expect(() => S.String().convertJSONToJS(null)).toThrowError(
        JSONValueParseError
      );
      expect(() =>
        S.String({ nullable: true }).convertJSONToJS(null)
      ).not.toThrow();
    });
  });

  describe('convertJSToJSON', () => {
    it('returns values as is', () => {
      expect(S.String().convertJSToJSON('foo')).toBe('foo');
      expect(S.String().convertJSToJSON('')).toBe('');
      expect(S.String({ nullable: true }).convertJSToJSON(null)).toBe(null);
    });
  });

  describe('validateTripleValue', () => {
    it('properly validates string inputs', () => {
      expect(S.String().validateTripleValue('foo')).toBe(true);
      expect(S.String().validateTripleValue('')).toBe(true);
    });
    it('fails if value is not a string', () => {
      expect(S.String().validateTripleValue(1)).toBe(false);
    });
    it('fails if value is null and not nullable', () => {
      expect(S.String().validateTripleValue(null)).toBe(false);
      expect(S.String({ nullable: true }).validateTripleValue(null)).toBe(true);
    });
  });

  describe('fromString', () => {
    it('returns values as is', () => {
      expect(S.String().fromString('foo')).toBe('foo');
      expect(S.String().fromString('')).toBe('');
    });
  });
});

describe('S.Query', () => {
  describe('convertInputToDBValue', () => {
    it('throws error', () => {
      expect(() =>
        S.Query({ collectionName: 'test' }).convertInputToDBValue('foo')
      ).toThrowError(TriplitError);
    });
  });

  describe('convertDBValueToJS', () => {
    it('requires a schema argument', () => {
      expect(() =>
        S.Query({ collectionName: 'test' }).convertDBValueToJS('foo')
      ).toThrowError(TriplitError);
    });
    it('requires that the query collection exists in the schema', () => {
      const schema = {
        test: { schema: S.Schema({ id: S.String() }) },
      };
      expect(() =>
        S.Query({ collectionName: 'foo' }).convertDBValueToJS('foo', schema)
      ).toThrowError(CollectionNotFoundError);
    });
    it('cardinality = "one" returns a converted value', () => {
      const schema = {
        test: { schema: S.Schema({ id: S.String(), date: S.Date() }) },
      };
      const d = new Date(2012, 1, 1);
      const type = S.Query({ collectionName: 'test' }, 'one');
      expect(
        type.convertDBValueToJS({ id: '123', date: d.toISOString() }, schema)
      ).toStrictEqual({ id: '123', date: d });
      expect(type.convertDBValueToJS(null, schema)).toBe(null);
    });
    it('cardinality = "many" returns an array', () => {
      const schema = {
        test: { schema: S.Schema({ id: S.String(), date: S.Date() }) },
      };
      const d1 = new Date(2012, 1, 1);
      const d2 = new Date(2013, 1, 1);
      const type = S.Query({ collectionName: 'test' }, 'many');
      expect(
        type.convertDBValueToJS(
          [
            { id: '123', date: d1.toISOString() },
            { id: '456', date: d2.toISOString() },
          ],
          schema
        )
      ).toStrictEqual([
        { id: '123', date: d1 },
        { id: '456', date: d2 },
      ]);
      expect(type.convertDBValueToJS(null, schema)).toBe(null);
    });
    it('throws error if cardinality is invalid', () => {
      const schema = {
        test: { schema: S.Schema({ id: S.String(), date: S.Date() }) },
      };
      expect(() =>
        S.Query(
          {
            collectionName: 'test',
          },
          'foo'
        ).convertDBValueToJS('foo', schema)
      ).toThrowError(InvalidQueryCardinalityError);
    });
  });

  describe('convertJSONToJS', () => {
    it('requires a schema argument', () => {
      expect(() =>
        S.Query({ collectionName: 'test' }).convertJSONToJS('foo')
      ).toThrowError(TriplitError);
    });
    it('requires that the query collection exists in the schema', () => {
      const schema = {
        test: { schema: S.Schema({ id: S.String() }) },
      };
      expect(() =>
        S.Query({ collectionName: 'foo' }).convertJSONToJS('foo', schema)
      ).toThrowError(CollectionNotFoundError);
    });
    it('cardinality = "one" returns a converted value', () => {
      const schema = {
        test: { schema: S.Schema({ id: S.String(), date: S.Date() }) },
      };
      const d = new Date(2012, 1, 1);
      const type = S.Query({ collectionName: 'test' }, 'one');
      expect(
        type.convertJSONToJS({ id: '123', date: d.toISOString() }, schema)
      ).toStrictEqual({ id: '123', date: d });
      expect(type.convertJSONToJS(null, schema)).toBe(null);
    });
    it('cardinality = "many" returns an array', () => {
      const schema = {
        test: { schema: S.Schema({ id: S.String(), date: S.Date() }) },
      };
      const d1 = new Date(2012, 1, 1);
      const d2 = new Date(2013, 1, 1);
      const type = S.Query({ collectionName: 'test' }, 'many');
      expect(
        type.convertJSONToJS(
          [
            { id: '123', date: d1.toISOString() },
            { id: '456', date: d2.toISOString() },
          ],
          schema
        )
      ).toStrictEqual([
        { id: '123', date: d1 },
        { id: '456', date: d2 },
      ]);
      expect(type.convertJSONToJS(null, schema)).toBe(null);
    });
    it('throws error if cardinality is invalid', () => {
      const schema = {
        test: { schema: S.Schema({ id: S.String(), date: S.Date() }) },
      };
      expect(() =>
        S.Query(
          {
            collectionName: 'test',
          },
          'foo'
        ).convertJSONToJS('foo', schema)
      ).toThrowError(InvalidQueryCardinalityError);
    });
  });

  describe('convertJSToJSON', () => {
    it('requires a schema argument', () => {
      expect(() =>
        S.Query({ collectionName: 'test' }).convertJSToJSON('foo')
      ).toThrowError(TriplitError);
    });
    it('requires that the query collection exists in the schema', () => {
      const schema = {
        test: { schema: S.Schema({ id: S.String() }) },
      };
      expect(() =>
        S.Query({ collectionName: 'foo' }).convertJSToJSON('foo', schema)
      ).toThrowError(CollectionNotFoundError);
    });
    it('cardinality = "one" returns a converted value', () => {
      const schema = {
        test: { schema: S.Schema({ id: S.String(), date: S.Date() }) },
      };
      const d = new Date(2012, 1, 1);
      const type = S.Query({ collectionName: 'test' }, 'one');
      expect(
        type.convertJSToJSON({ id: '123', date: d }, schema)
      ).toStrictEqual({ id: '123', date: d.toISOString() });
      expect(type.convertJSToJSON(null, schema)).toBe(null);
    });
    it('cardinality = "many" returns an array', () => {
      const schema = {
        test: { schema: S.Schema({ id: S.String(), date: S.Date() }) },
      };
      const d1 = new Date(2012, 1, 1);
      const d2 = new Date(2013, 1, 1);
      const type = S.Query({ collectionName: 'test' }, 'many');
      expect(
        type.convertJSToJSON(
          [
            { id: '123', date: d1 },
            { id: '456', date: d2 },
          ],
          schema
        )
      ).toStrictEqual([
        { id: '123', date: d1.toISOString() },
        { id: '456', date: d2.toISOString() },
      ]);
      expect(type.convertJSToJSON(null, schema)).toBe(null);
    });
    it('throws error if cardinality is invalid', () => {
      const schema = {
        test: { schema: S.Schema({ id: S.String(), date: S.Date() }) },
      };
      expect(() =>
        S.Query(
          {
            collectionName: 'test',
          },
          'foo'
        ).convertJSToJSON('foo', schema)
      ).toThrowError(InvalidQueryCardinalityError);
    });
  });
});

describe('S.Set', () => {
  it('should only allow value types as set types', () => {
    expect(() => S.Schema({ foo: S.Set(S.Number()) })).not.toThrowError();
    expect(() => S.Schema({ foo: S.Set(S.String()) })).not.toThrowError();
    expect(() => S.Schema({ foo: S.Set(S.Boolean()) })).not.toThrowError();
    expect(() => S.Schema({ foo: S.Set(S.Date()) })).not.toThrowError();
    expect(() => S.Schema({ foo: S.Set(S.Set()) })).toThrowError();
    expect(() => S.Schema({ foo: S.Set(S.Schema()) })).toThrowError();
  });
  it('set types cannot be nullable', () => {
    expect(() =>
      S.Schema({ foo: S.Set(S.Number({ nullable: true })) })
    ).toThrowError(InvalidSchemaOptionsError);
  });
});

it('should prevent an invalid accession in a schema', () => {
  const StudentSchema = S.Schema({
    name: S.String(),
    classes: S.Set(S.String()),
    graduationYear: S.Number(),
  });
  expect(() => getSchemaFromPath(StudentSchema, ['grade', 'foo'])).toThrow(
    InvalidSchemaPathError
  );
});

describe('traversal', () => {
  const schema = {
    a: {
      schema: S.Schema({
        id: S.Id(),
        attr: S.String(),
        record: S.Record({
          innerAttr: S.String(),
        }),
        bId: S.String(),
        b: S.RelationById('b', '$bId'),
      }),
    },
    b: {
      schema: S.Schema({
        id: S.Id(),
        attr: S.String(),
      }),
    },
  };

  it('traverser initializes to proper schema', () => {
    const schemaTraverser = createSchemaTraverser(schema, 'a');
    expect(schemaTraverser.current).toBe(schema.a.schema);
  });

  it('traverser can traverse to an attribute', () => {
    let schemaTraverser = createSchemaTraverser(schema, 'a');
    schemaTraverser = schemaTraverser.get('attr');
    expect(schemaTraverser.current).toBe(schema.a.schema.properties.attr);
  });

  it('traverser can traverse to a record attribute', () => {
    let schemaTraverser = createSchemaTraverser(schema, 'a');
    schemaTraverser = schemaTraverser.get('record').get('innerAttr');
    expect(schemaTraverser.current).toBe(
      schema.a.schema.properties.record.properties.innerAttr
    );
  });

  it('traverser can traverse to a relation', () => {
    let schemaTraverser = createSchemaTraverser(schema, 'a');
    schemaTraverser = schemaTraverser.get('b');
    expect(schemaTraverser.current).toBe(schema.a.schema.properties.b);
  });

  it('traverser can traverse to a relation attribute', () => {
    let schemaTraverser = createSchemaTraverser(schema, 'a');
    schemaTraverser = schemaTraverser.get('b').get('attr');
    expect(schemaTraverser.current).toBe(schema.b.schema.properties.attr);
  });

  it('traverser sets current to undefined if path doesnt exist', () => {
    let schemaTraverser = createSchemaTraverser(schema, 'a');
    schemaTraverser = schemaTraverser.get('non-existent');
    expect(schemaTraverser.current).toBe(undefined);
    // can continue traversing
    schemaTraverser = schemaTraverser.get('non-existent');
    expect(schemaTraverser.current).toBe(undefined);
  });

  it('can handle non existent initial collection', () => {
    const schemaTraverser = createSchemaTraverser(schema, 'non-existent');
    expect(schemaTraverser.current).toBe(undefined);
  });
});

describe('iterator', () => {
  const schema = {
    a: {
      schema: S.Schema({
        id: S.Id(),
        attr: S.String(),
        record: S.Record({
          innerAttr: S.String(),
        }),
        bId: S.String(),
        b: S.RelationById('b', '$bId'),
      }),
    },
    b: {
      schema: S.Schema({
        id: S.Id(),
        attr: S.String(),
      }),
    },
  };

  it('can iterate over schema properties', () => {
    const schemaTraverser = createSchemaIterator(['attr'], schema, 'a');
    const properties = [...schemaTraverser];
    expect(properties).toEqual([schema.a.schema.properties.attr]);
  });
  it('can iterate over record properties', () => {
    const schemaTraverser = createSchemaIterator(
      ['record', 'innerAttr'],
      schema,
      'a'
    );
    const properties = [...schemaTraverser];
    expect(properties).toEqual([
      schema.a.schema.properties.record,
      schema.a.schema.properties.record.properties.innerAttr,
    ]);
  });
  it('can iterate over relation properties', () => {
    const schemaTraverser = createSchemaIterator(['b', 'attr'], schema, 'a');
    const properties = [...schemaTraverser];
    expect(properties).toEqual([
      schema.a.schema.properties.b,
      schema.b.schema.properties.attr,
    ]);
  });
  it('returns undefined if path doenst exist', () => {
    const schemaTraverser = createSchemaIterator(
      ['no', 'path', 'here'],
      schema,
      'a'
    );
    const properties = [...schemaTraverser];
    expect(properties).toEqual([undefined, undefined, undefined]);
  });
  it('can handle non existent initial collection', () => {
    const schemaTraverser = createSchemaIterator(
      ['attr'],
      schema,
      'non-existent'
    );
    const properties = [...schemaTraverser];
    expect(properties).toEqual([undefined]);
  });
});

it.only('should throw an error if you attempt to initialize a schema with a malformed type', () => {
  expect(async () => {
    const db = new DB({
      schema: {
        version: 0,
        collections: {
          a: {
            schema: S.Schema({
              id: S.Id(),
              attr: { ...S.String(), type: 'invalid type' },
            }),
          },
        },
      },
    });
    await db.ready;
  }).toThrow(MalformedSchemaError);
});

import { it } from 'vitest';
import { Schema as S } from '../src/schema/builder.js';
import { createSchemaEntriesIterator } from '../src/schema/utilities.js';

it.todo('createSchemaEntriesIterator iterates over schema', () => {
  const schema = S.Collections({
    a: {
      schema: S.Schema({
        id: S.Id(),
        a_attr: S.String(),
      }),
      relationships: {
        b: S.RelationById('b', '$1.id'),
      },
    },
    b: {
      schema: S.Schema({
        id: S.Id(),
        b_attr: S.Number(),
      }),
      relationships: {
        c: S.RelationById('c', '$1.id'),
      },
    },

    c: {
      schema: S.Schema({
        id: S.Id(),
        c_attr: S.Boolean(),
      }),
    },
  });
  const cases = [['a_attr'], ['b', 'b_attr'], ['b', 'c', 'c_attr'], ['b']];
  const iterator = createSchemaEntriesIterator(cases[2], schema, 'a');
  for (const entries of iterator) {
    console.log(entries);
  }
});

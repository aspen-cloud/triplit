import { describe, expect, it } from 'vitest';
import { Schema as S } from '../src/schema/builder.js';
import { DB } from '../src';
const schema = {
  collections: {
    default: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
        nested: S.Record({
          name: S.String(),
        }),
      }),
    },
  },
};
describe.each([true, false])('schema is defined: %', (isDefined) => {
  it("shouldn't change the source entity after it's inserted and updated", async () => {
    const db = new DB({ schema: isDefined ? schema : undefined });

    const entity = deepFreeze({
      id: '1',
      name: 'John',
      nested: { name: 'Doe' },
    });
    await db.insert('default', entity);
    await db.update('default', '1', (e) => {
      e.name = 'Jane';
      e.nested.name = 'Smith';
    });
    expect(entity).toEqual({ id: '1', name: 'John', nested: { name: 'Doe' } });
  });
});

function deepFreeze(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  Object.getOwnPropertyNames(obj).forEach((name) => {
    deepFreeze(obj[name]);
  });
  return Object.freeze(obj);
}

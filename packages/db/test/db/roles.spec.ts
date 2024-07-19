import { it, expect } from 'vitest';
import DB from '../../src/db.ts';
import { Schema as S } from '../../src/schema/builder.ts';

it('DB constr uctor can handle undefined roles', async () => {
  const db = new DB({
    schema: {
      roles: undefined,
      collections: {
        users: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
      },
    },
  });
  expect(db.ready).resolves.not.toThrow();
});

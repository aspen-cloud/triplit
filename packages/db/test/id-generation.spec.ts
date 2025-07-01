import { describe, expect, it } from 'vitest';
import { Schema as S, DB } from '../src/index.ts';
import { tryPreloadingOptionalDeps } from '../src/utils/optional-dep.ts';

describe('default id generation', () => {
  it.each(['nanoid', 'uuidv4', 'uuidv7'] as const)(
    'should generate %s id by default',
    async (idType) => {
      const schema = S.Schema({
        id: S.Id({ format: idType }),
      });
      await tryPreloadingOptionalDeps();
      const db = new DB({ schema: { collections: { test: { schema } } } });
      const resp = await db.insert('test', {});
      expect(resp.id).toBeDefined();
      if (idType === 'nanoid') {
        expect(resp.id.length).toBe(21);
      }
      if (idType === 'uuidv4') {
        expect(resp.id.length).toBe(36);
      }
      if (idType === 'uuidv7') {
        expect(resp.id.length).toBe(36);
      }
    }
  );
  it('legacy "uuid" should generate nanoid for backward compatibility', async () => {
    const schema = S.Schema({
      id: S.String({ nullable: true, default: { func: 'uuid' } }),
    });
    const db = new DB({ schema: { collections: { test: { schema } } } });
    const resp = await db.insert('test', {});
    expect(resp.id).toBeDefined();
    expect(resp.id!.length).toBe(21);
  });
});

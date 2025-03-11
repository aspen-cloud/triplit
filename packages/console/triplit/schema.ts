import { Schema as S, type Entity } from '@triplit/client';

export const schema = S.Collections({
  servers: {
    schema: S.Schema({
      id: S.Id(),
      created_at: S.Date({ default: S.Default.now() }),
      url: S.String(),
      displayName: S.String(),
    }),
    relationships: {
      tokens: S.RelationMany('tokens', {
        where: [['serverUrl', '=', '$1.url']],
        order: [['created_at', 'ASC']],
      }),
    },
  },
  tokens: {
    schema: S.Schema({
      id: S.Id(),
      created_at: S.Date({ default: S.Default.now() }),
      value: S.String(),
      name: S.String(),
      serverUrl: S.String(),
    }),
  },
});

export type Server = Entity<typeof schema, 'servers'>;

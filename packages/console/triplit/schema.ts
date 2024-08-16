import { Schema as S } from '@triplit/client';

export const schemaObject = {
  filters: {
    schema: S.Schema({
      id: S.Id(),
      attribute: S.String(),
      asType: S.String(),
      operator: S.String(),
      value: S.String(),

      collectionName: S.String(),
      projectId: S.String(),
    }),
  },

  orders: {
    schema: S.Schema({
      id: S.Id(),
      attribute: S.String({ nullable: true }),
      direction: S.String({ nullable: true }),
      collectionName: S.String(),
      projectId: S.String(),
      // fractionalIndex: S.String(),
    }),
  },

  projects: {
    schema: S.Schema({
      id: S.Id(),
      displayName: S.String(),
      projectId: S.Optional(S.String()),
      token: S.String(),
      server: S.String(),
      secure: S.Boolean(),
    }),
  },
  selections: {
    schema: S.Schema({
      id: S.Id(),
      collectionName: S.String(),
      projectId: S.String(),
    }),
  },
};
export type SchemaType = typeof schemaObject;

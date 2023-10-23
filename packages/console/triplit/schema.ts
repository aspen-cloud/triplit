import { Schema as S } from '@triplit/client';

export const schemaObject = {
  filters: {
    schema: S.Schema({
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
      attribute: S.String({ nullable: true }),
      direction: S.String({ nullable: true }),
      collectionName: S.String(),
      projectId: S.String(),
      // fractionalIndex: S.String(),
    }),
  },

  projects: {
    schema: S.Schema({
      displayName: S.String(),
      projectId: S.String(),
      token: S.String(),
      server: S.String(),
      secure: S.Boolean(),
    }),
  },
  selections: {
    schema: S.Schema({
      collectionName: S.String(),
      projectId: S.String(),
    }),
  },
};
export type SchemaType = typeof schemaObject;

/**
 * This file is auto-generated by the Triplit CLI.
 */

import { Schema as S, Roles } from '@triplit/client';
export const roles: Roles = {};
export const schema = {
  test: {
    schema: S.Schema({
      id: S.String({ nullable: false, default: S.Default.Id.nanoid() }),
      attr: S.String(),
    }),
    relationships: {
      relation: S.RelationById('relatedCollection', '$attr'),
    },
  },
  relatedCollection: {
    schema: S.Schema({
      id: S.String({ nullable: false, default: S.Default.Id.nanoid() }),
    }),
  },
};

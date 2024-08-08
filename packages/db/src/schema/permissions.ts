import { CollectionNameFromModels } from '../db.js';
import { matchPattern } from '../utils/pattern-matcher.js';
import { Models, StoreSchema } from './types';

export type SessionRole = {
  key: string;
  roleVars: Record<string, any>;
};

/**
 * Parse a token and return the roles that match the token
 * return undefined to indicate no permissions defined (so can skip)
 * return [] to indicate no roles match the token
 */
export function getRolesFromSession<
  M extends Models<any, any> | undefined,
  S extends StoreSchema<M>
>(schema: S, token: Record<string, any>): SessionRole[] | undefined {
  if (!schema) return undefined;

  const roles = schema.roles;
  if (!roles) return [];

  const sessionRoles: SessionRole[] = [];
  for (const [key, role] of Object.entries(roles)) {
    const roleVars = matchPattern(role.match, token);
    if (roleVars === undefined) continue;
    sessionRoles.push({ key, roleVars });
  }
  return sessionRoles;
}

export function getCollectionPermissions<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(schema: M, collectionName: CN) {
  if (!schema) return undefined;
  const collection = schema[collectionName];
  if (!collection) return undefined;
  return collection.permissions;
}

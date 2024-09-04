import { CollectionNameFromModels } from '../db.js';
import { matchPattern } from '../utils/pattern-matcher.js';
import { Models, StoreSchema } from './types/index.js';

export type SessionRole = {
  key: string;
  roleVars: Record<string, any>;
};

/**
 * Parse a token and return the roles that match the token
 * return undefined to indicate no permissions defined (so can skip)
 * return [] to indicate no roles match the token
 */
export function getRolesFromSession<M extends Models, S extends StoreSchema<M>>(
  schema: S | undefined,
  token: Record<string, any>
): SessionRole[] | undefined {
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
  M extends Models,
  CN extends CollectionNameFromModels<M>
>(schema: M, collectionName: CN) {
  if (!schema) return undefined;
  const collection = schema[collectionName];
  if (!collection) return undefined;
  return collection.permissions;
}

export function normalizeSessionVars(variables: Record<string, any>) {
  const normalizedVars: Record<string, any> = {};

  // For backwards compatibility assign to SESSION_USER_ID
  if ('x-triplit-user-id' in variables)
    normalizedVars['SESSION_USER_ID'] = variables['x-triplit-user-id'];

  // Assign token to session vars
  Object.assign(normalizedVars, variables);

  // Translate 'scope' claim to array: https://datatracker.ietf.org/doc/html/rfc8693#name-scope-scopes-claim
  // remove this when we support functions in queries
  if (
    'scope' in normalizedVars &&
    !('_scope' in normalizedVars) &&
    typeof normalizedVars['scope'] === 'string'
  ) {
    normalizedVars['_scope'] = normalizedVars['scope'].split(' ');
  }
  return normalizedVars;
}

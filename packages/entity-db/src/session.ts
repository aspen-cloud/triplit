import { DB, DBSchema } from './db.js';
import { matchPattern } from './utils/pattern-matcher.js';
import { hash } from './utils/hash.js';
import { Models, SessionRole } from './schema/index.js';

export interface Session {
  vars: Record<string, any>;
  roles: SessionRole[];
}

export class DBSession implements Session {
  readonly vars: Record<string, any>;
  readonly db: DB<any>;
  private _roles: SessionRole[] | undefined;
  constructor(db: DB<any>, vars: Record<string, any>) {
    this.db = db;
    this.vars = Object.freeze(vars);
  }

  // TODO: Handle schema changes and re-evaluate roles
  get roles() {
    // Need to load schema before evaluating roles
    // This allows this api to remain synchronous
    // if (!this._roles)
    //   this._roles = getRolesFromSession(this.db.schema, this.vars) ?? [];
    return getRolesFromSession(this.db.schema, this.vars) ?? [];
  }
}

export function createSession<T extends DB<any>>(
  db: T,
  vars: Record<string, any>
): T {
  const session = new DBSession(db, vars);
  const DBWrapper = new Proxy<T>(db, {
    get(target, prop, receiver) {
      if (prop === 'session') {
        return session;
      }
      return Reflect.get(target, prop, receiver);
    },
    set: Reflect.set,
    deleteProperty: Reflect.deleteProperty,
  });
  // This is less than ideal because each session will have it's own IVM so it can't share state
  // across multiple sessions like on the server
  return DBWrapper;
}

/**
 * Parse a token and return the roles that match the token
 * return undefined to indicate no permissions defined (so can skip)
 * return [] to indicate no roles match the token
 */
export function getRolesFromSession<M extends Models<M>, S extends DBSchema<M>>(
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

export function sessionRolesAreEquivalent(
  a: SessionRole[] | undefined,
  b: SessionRole[] | undefined
): boolean {
  if (a === undefined && b === undefined) {
    return true;
  }

  if (a?.length !== b?.length) {
    return false;
  }

  const aKeys = a?.map(({ key }) => key);
  const bKeys = b?.map(({ key }) => key);
  if (aKeys?.some((roleKey) => !bKeys?.includes(roleKey))) {
    return false;
  }

  const aVarsHashed = hashRoleVars(a!);
  const bVarsHashed = hashRoleVars(b!);
  return aKeys?.every((key) => aVarsHashed[key] === bVarsHashed[key])!;
}

function hashRoleVars(roles: SessionRole[]) {
  return roles.reduce(
    (prev, { key, roleVars }) => {
      prev[key] = hash(roleVars);
      return prev;
    },
    {} as Record<string, string>
  );
}

// TOOD: evaluate if we can support 'scope' issues (one fix is allowing functions in queries)
// TODO: evaluate continued support for 'SESSION_USER_ID'
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

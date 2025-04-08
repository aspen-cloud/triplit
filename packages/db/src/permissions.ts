import { QueryWhere } from './query/types/index.js';
import type {
  CollectionPermission,
  CollectionPermissions,
  Models,
  PermissionMatcher,
  PermissionOperations,
  PermissionWriteOperations,
  Role,
  RolePermissions,
  Roles,
} from './schema/index.js';

export function getCollectionPermissions(
  schema: Models | undefined,
  collectionName: string
) {
  if (!schema) return undefined;
  const collection = schema[collectionName];
  if (!collection) return undefined;
  return collection.permissions;
}

export function isReadPermissionOperation(operation: PermissionOperations) {
  return operation === 'read';
}

export function isWritePermissionOperation(
  operation: PermissionOperations
): operation is PermissionWriteOperations {
  return !isReadPermissionOperation(operation);
}

export function permissionsEqual(
  a: RolePermissions | undefined,
  b: RolePermissions | undefined
) {
  if (!a && !b) return true;
  if (!a || !b) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    const permissionsA = a[key];
    const permissionsB = b[key];
    if (!operationPermissionsEqual(permissionsA, permissionsB)) return false;
  }
  return true;
}

function operationPermissionsEqual(
  a: CollectionPermissions | undefined,
  b: CollectionPermissions | undefined
) {
  if (!a && !b) return true;
  if (!a || !b) return false;

  if (!permissionDefinitionEqual(a.read, b.read)) return false;
  if (!permissionDefinitionEqual(a.insert, b.insert)) return false;
  if (!permissionDefinitionEqual(a.update, b.update)) return false;
  if (!permissionDefinitionEqual(a.postUpdate, b.postUpdate)) return false;
  if (!permissionDefinitionEqual(a.delete, b.delete)) return false;
  return true;
}

function permissionDefinitionEqual(
  a: CollectionPermission | undefined,
  b: CollectionPermission | undefined
) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (!permissionFilterEqual(a.filter, b.filter)) return false;
  return true;
}

function permissionFilterEqual(
  a: QueryWhere | undefined,
  b: QueryWhere | undefined
) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  // TODO: this can be more precise
  return JSON.stringify(a) === JSON.stringify(b);
}

export function rolesEqual(a: Roles | undefined, b: Roles | undefined) {
  if (!a && !b) return true;
  if (!a || !b) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    const roleA = a[key];
    const roleB = b[key];
    if (!roleEqual(roleA, roleB)) return false;
  }
  return true;
}

export function roleEqual(a: Role | undefined, b: Role | undefined) {
  if (!a && !b) return true;
  if (!a || !b) return false;

  if (!permissionMatcherEqual(a.match, b.match)) return false;
  return true;
}

function permissionMatcherEqual(
  a: PermissionMatcher | undefined,
  b: PermissionMatcher | undefined
) {
  if (!a && !b) return true;
  if (!a || !b) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    const matcherA = a[key];
    const matcherB = b[key];
    if (JSON.stringify(matcherA) !== JSON.stringify(matcherB)) return false;
  }
  return true;
}

import { DBSchema } from '../db.js';
import { DEFAULT_FUNCTIONS } from './data-types/constants.js';
import {
  BooleanType,
  DateType,
  NumberType,
  RecordType,
  SetType,
  StringType,
} from './data-types/index.js';
import { hasNoValue, isPrimitiveType } from './data-types/type.js';
import {
  Collection,
  CollectionPermission,
  CollectionPermissions,
  DataType,
  DefaultFunction,
  DefaultFunctionId,
  Model,
  Models,
  Relationship,
  Role,
  TypeConfig,
} from './types/index.js';

export function validateSchema(schema: DBSchema) {
  // is defined
  if (hasNoValue(schema)) return 'schema is not defined';
  // is object
  if (typeof schema !== 'object') return 'schema is not an object';
  // Validate roles first, used in collection definitions
  const invalidRoles = validateRoles(schema.roles);
  if (invalidRoles)
    return `schema roles definition is invalid: ${invalidRoles}`;
  // validate collections
  const invalidCollections = validateCollections(schema.collections, schema);
  if (invalidCollections)
    return `schema collections definition is invalid: ${invalidCollections}`;
}

function validateRoles(roles: DBSchema['roles']) {
  if (hasNoValue(roles)) return;
  if (typeof roles !== 'object') return 'roles is not an object';
  for (const key in roles) {
    const invalidRoleName = validateRoleName(key);
    if (invalidRoleName) return `role "${key}" is invalid: ${invalidRoleName}`;
    const role = roles[key];
    const invalidRole = validateRole(role);
    if (invalidRole) return `role "${key}" is invalid: ${invalidRole}`;
  }
}

function validateRole(role: Role) {
  if (hasNoValue(role)) return 'role is not defined';
  if (typeof role !== 'object') return 'role is not an object';
  if (hasNoValue(role.match)) return 'matcher is not defined';
  if (typeof role.match !== 'object') return 'matcher is not an object';
}

function validateCollections(collections: Models, schema: DBSchema) {
  if (hasNoValue(collections)) return 'collections is not defined';
  if (typeof collections !== 'object') return 'collections is not an object';
  for (const key in collections) {
    const invalidCollectonName = validateCollectionName(key);
    if (invalidCollectonName)
      return `"${key}" is not a valid collection name: ${invalidCollectonName}`;
    const collection = collections[key];
    const invalidCollection = validateCollection(collection, schema);
    if (invalidCollection)
      return `"${key}" is not a valid collection: ${invalidCollection}`;
  }
}

export function validateCollectionName(name: string) {
  if (hasNoValue(name)) 'collection name is not defined';
  if (typeof name !== 'string') return 'collection name is not a string';
  if (name.length === 0) return 'collection name is empty';
  if (name.startsWith('_'))
    return 'collection name cannot start with an underscore';
  if (/^[0-9]/.test(name))
    return 'collection name cannot start with a numeric character';
  if (!/^[a-zA-Z0-9_]+$/.test(name))
    return 'collection name contains invalid characters - only alphanumeric characters and underscores are allowed.';
}

export function validateCollection(collection: Collection, schema: DBSchema) {
  if (hasNoValue(collection)) return 'collection is not defined';
  if (typeof collection !== 'object') return 'collection is not an object';
  const invalidCollectionSchema = validateCollectionSchema(collection.schema);
  if (invalidCollectionSchema)
    return `collection schema is invalid: ${invalidCollectionSchema}`;
  if ('relationships' in collection) {
    const invalidRelationships = validateRelationships(
      collection.relationships
    );
    if (invalidRelationships)
      return `collection relationships is invalid: ${invalidRelationships}`;
  }
  if ('permissions' in collection) {
    const invalidPermissions = validateRolePermissions(
      collection.permissions,
      schema
    );
    if (invalidPermissions)
      return `collection permissions is invalid: ${invalidPermissions}`;
  }
}

export function validateCollectionSchema(schema: Model) {
  if (hasNoValue(schema)) return 'schema is not defined';
  if (typeof schema !== 'object') return 'schema is not an object';
  const invalidDatatype = validateRecordType(schema);
  if (invalidDatatype) return `${invalidDatatype}`;
  if (hasNoValue(schema.properties.id))
    return 'primary key field "id" is not defined';
  const invalidId = validateStringType(schema.properties.id);
  if (invalidId) return `primary key field "id" is invalid: ${invalidId}`;
}

export function validateDataType(type: DataType): string | undefined {
  if (hasNoValue(type)) return 'type is not defined';
  if (typeof type !== 'object') return 'type is not a DataType';
  if (type.type === 'boolean') {
    return validateBooleanType(type);
  }
  if (type.type === 'date') {
    return validateDateType(type);
  }
  if (type.type === 'number') {
    return validateNumberType(type);
  }
  if (type.type === 'record') {
    return validateRecordType(type);
  }
  if (type.type === 'set') {
    return validateSetType(type);
  }
  if (type.type === 'string') {
    return validateStringType(type);
  }
  return `type "${
    // @ts-expect-error - exhaustive check, if failing either a new datatype exists or not every path returns
    type.type
  }" is not recognized`;
}

function validateBooleanType(type: BooleanType) {
  if (type.type !== 'boolean') return 'not a boolean type';
  const configInvalid = validateBaseDataTypeConfig(type.config);
  if (configInvalid) return `type boolean is invalid: ${configInvalid}`;
  return;
}

function validateDateType(type: DateType) {
  if (type.type !== 'date') return 'not a date type';
  const configInvalid = validateBaseDataTypeConfig(type.config);
  if (configInvalid) return `type date is invalid: ${configInvalid}`;
  return;
}

function validateNumberType(type: NumberType) {
  if (type.type !== 'number') return 'not a number type';
  const configInvalid = validateBaseDataTypeConfig(type.config);
  if (configInvalid) return `type number is invalid: ${configInvalid}`;
  return;
}

function validateRecordType(type: RecordType) {
  if (type.type !== 'record') return 'not a record type';
  const configInvalid = validateBaseDataTypeConfig(type.config);
  if (configInvalid) return `type record is invalid: ${configInvalid}`;
  if (hasNoValue(type.properties)) return 'type record is missing properties';
  if (typeof type.properties !== 'object')
    return 'type record properties is not an object';
  for (const key in type.properties) {
    const invalidPropertyName = validatePropertyName(key);
    if (invalidPropertyName)
      return `type record property "${key}" is invalid: ${invalidPropertyName}`;
    const property = type.properties[key];
    const invalidProperty = validateDataType(property);
    if (invalidProperty)
      return `type record property "${key}" is invalid: ${invalidProperty}`;
  }
}

function validateSetType(type: SetType) {
  if (type.type !== 'set') return 'not a set type';
  const configInvalid = validateBaseDataTypeConfig(type.config);
  if (configInvalid) return `type set is invalid: ${configInvalid}`;
  if (hasNoValue(type.items)) return 'type set is missing items';
  const invalidItems = validateDataType(type.items);
  if (invalidItems) return `type set items is invalid: ${invalidItems}`;
  if (!isPrimitiveType(type.items))
    return 'type set items must be a primitive type';
}

function validateStringType(type: StringType) {
  if (type.type !== 'string') return 'not a string type';
  const configInvalid = validateBaseDataTypeConfig(type.config);
  if (configInvalid) return `type string is invalid: ${configInvalid}`;
  if (!hasNoValue(type.config?.enum)) {
    if (!Array.isArray(type.config.enum))
      return 'type string enum is not an array';
    for (const value of type.config.enum) {
      if (typeof value !== 'string')
        return 'type string enum value is not a string';
    }
  }
}

function validatePropertyName(name: string) {
  if (hasNoValue(name)) return 'property name is not defined';
  if (typeof name !== 'string') return 'property name is not a string';
  if (name.length === 0) return 'property name is empty';
  if (/^[0-9]/.test(name))
    return 'property name cannot start with a numeric character';
  if (!/^[a-zA-Z0-9_]+$/.test(name))
    return 'property name contains invalid characters - only alphanumeric characters and underscores are allowed.';
}

export function validateBaseDataTypeConfig(config: TypeConfig | undefined) {
  if (hasNoValue(config)) return;
  if (typeof config !== 'object') return 'type config is not an object';
  // validate nullable
  if (!hasNoValue(config.nullable) && typeof config.nullable !== 'boolean')
    return 'option nullable is invalid';
  // validate optional
  if (!hasNoValue(config.optional) && typeof config.optional !== 'boolean')
    return 'option optional is invalid';
  // validate default
  const invalidDefault = validateDefaultValue(config.default);
  if (invalidDefault) return `option default is invalid: ${invalidDefault}`;
}

function validateDefaultValue(value: any) {
  if (hasNoValue(value)) return;
  // TODO: validate default value based on type (or enum)
  if (typeof value === 'object') {
    const invalidDefaultFunction = validateDefaultFunction(value);
    if (invalidDefaultFunction)
      return `default value is invalid: ${invalidDefaultFunction}`;
  } else if (
    typeof value !== 'number' &&
    typeof value !== 'boolean' &&
    typeof value !== 'string'
  )
    return 'default value is not a primitive';
}

function validateDefaultFunction(fnObj: DefaultFunction) {
  if (typeof fnObj !== 'object') return 'default function format is invalid';
  if (hasNoValue(fnObj.func))
    return 'default function is missing func identifier';
  const funcId = fnObj.func;
  if (!isDefaultFunctionId(funcId))
    return `default function ${fnObj.func} is not recognized`;
  if (funcId === 'now') {
    if (!hasNoValue(fnObj.args)) return 'default function "now" has no args';
  }
  if (funcId === 'uuid') {
    if (!hasNoValue(fnObj.args)) {
      if (!Array.isArray(fnObj.args)) {
        return 'default function "uuid" args is not an array';
      }
      if (fnObj.args.length > 0) {
        if (typeof fnObj.args[0] !== 'number')
          return 'default function "uuid" arg[0] is not a number';
      }
    }
  }
  if (funcId === 'Set.empty') {
    if (!hasNoValue(fnObj.args))
      return 'default function "Set.empty" has no args';
  }
}

function isDefaultFunctionId(id: string): id is DefaultFunctionId {
  return DEFAULT_FUNCTIONS.includes(id as DefaultFunctionId);
}

function validateRelationships(relationships: Collection['relationships']) {
  if (hasNoValue(relationships)) return;
  if (typeof relationships !== 'object')
    return 'relationships is not an object';
  for (const key in relationships) {
    const invalidRelationshipName = validateRelationshipName(key);
    if (invalidRelationshipName)
      return `relationship "${key}" is invalid: ${invalidRelationshipName}`;
    const relationship = relationships[key];
    const invalidRelationship = validateRelationship(relationship);
    if (invalidRelationship)
      return `relationship "${key}" is invalid: ${invalidRelationship}`;
  }
}

function validateRelationshipName(name: string) {
  if (hasNoValue(name)) return 'relationship name is not defined';
  if (typeof name !== 'string') return 'relationship name is not a string';
  if (name.length === 0) return 'relationship name is empty';
  if (name.startsWith('_'))
    return 'relationship name cannot start with an underscore';
  if (/^[0-9]/.test(name))
    return 'relationship name cannot start with a numeric character';
  if (!/^[a-zA-Z0-9_]+$/.test(name))
    return 'relationship name contains invalid characters - only alphanumeric characters and underscores are allowed.';
}

function validateRelationship(relationship: Relationship) {
  if (hasNoValue(relationship)) return 'relationship is not defined';
  if (typeof relationship !== 'object') return 'relationship is not an object';
  if (hasNoValue(relationship.cardinality)) return 'cardinality is not defined';
  if (relationship.cardinality !== 'one' && relationship.cardinality !== 'many')
    return 'cardinality is invalid';
  if (hasNoValue(relationship.query)) return 'query is not defined';
  if (typeof relationship.query !== 'object') return 'query is not an object';
  // Additional query validation occurs in prepareQuery
}

function validateRolePermissions(
  permissions: Collection['permissions'],
  schema: DBSchema
) {
  if (hasNoValue(permissions)) return;
  if (typeof permissions !== 'object') return 'permissions is not an object';
  for (const key in permissions) {
    // TODO: this may cause problems if roles are not provided / just validating permissions
    // maybe this should be a warning
    // const roleExists = schema.roles?.[key];
    // if (!roleExists) return `"${key}" does not match a role`;
    const permission = permissions[key];
    const invalidRolePermissions = validatePermissionOperations(permission);
    if (invalidRolePermissions)
      return `permissions for role "${key}" is invalid: ${invalidRolePermissions}`;
  }
}

function validatePermissionOperations(
  collectionPermissions: CollectionPermissions
) {
  // technically we'll allow, though i dont think we're typed to allow
  if (hasNoValue(collectionPermissions)) return;
  if (typeof collectionPermissions !== 'object') return 'not an object';
  if (collectionPermissions.read) {
    const invalidPermission = validateCollectionPermission(
      collectionPermissions.read
    );
    if (invalidPermission)
      return `"read" permission is invalid: ${invalidPermission}`;
  }
  if (collectionPermissions.insert) {
    const invalidPermission = validateCollectionPermission(
      collectionPermissions.insert
    );
    if (invalidPermission)
      return `insert permission is invalid: ${invalidPermission}`;
  }
  if (collectionPermissions.update) {
    const invalidPermission = validateCollectionPermission(
      collectionPermissions.update
    );
    if (invalidPermission)
      return `update permission is invalid: ${invalidPermission}`;
  }
  if (collectionPermissions.postUpdate) {
    const invalidPermission = validateCollectionPermission(
      collectionPermissions.postUpdate
    );
    if (invalidPermission)
      return `postUpdate permission is invalid: ${invalidPermission}`;
  }
  if (collectionPermissions.delete) {
    const invalidPermission = validateCollectionPermission(
      collectionPermissions.delete
    );
    if (invalidPermission)
      return `delete permission is invalid: ${invalidPermission}`;
  }
  return;
}

function validateCollectionPermission(permission: CollectionPermission) {
  if (hasNoValue(permission)) return;
  if (typeof permission !== 'object') return 'permission is not an object';
  if (hasNoValue(permission.filter)) return;
  // NOTE: we will perform additional filter validation during prepareQuery
}

function validateRoleName(name: string) {
  if (hasNoValue(name)) return 'role name is not defined';
  if (typeof name !== 'string') return 'role name is not a string';
  if (name.length === 0) return 'role name is empty';
  if (name.startsWith('_')) return 'role name cannot start with an underscore';
  if (/^[0-9]/.test(name))
    return 'role name cannot start with a numeric character';
  if (!/^[a-zA-Z0-9_]+$/.test(name))
    return 'role name contains invalid characters - only alphanumeric characters and underscores are allowed.';
}

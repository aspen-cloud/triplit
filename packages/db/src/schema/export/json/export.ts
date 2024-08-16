import {
  CollectionDefinition,
  CollectionsDefinition,
  SchemaDefinition,
} from '../../../data-types/serialization.js';
import {
  Collection,
  CollectionPermissions,
  Models,
  RolePermissions,
  StoreSchema,
} from '../../types';

export function schemaToJSON(schema: StoreSchema<Models>): SchemaDefinition;
export function schemaToJSON(schema: undefined): undefined;
export function schemaToJSON(
  schema: StoreSchema<Models> | undefined
): SchemaDefinition | undefined;
export function schemaToJSON(
  schema: StoreSchema<Models> | undefined
): SchemaDefinition | undefined {
  if (!schema) return undefined;
  const collections: CollectionsDefinition = {};
  for (const [collectionName, model] of Object.entries(schema.collections)) {
    const collection = collectionSchemaToJSON(model);
    collections[collectionName] = collection;
  }

  // Remove any undefined properties
  const santizedSchema = JSON.parse(
    JSON.stringify({ ...schema, version: schema.version, collections })
  );

  return santizedSchema;
}

function collectionSchemaToJSON(
  collection: Collection<any>
): CollectionDefinition {
  const rulesObj = collection.rules ? { rules: collection.rules } : {};
  const permissionsObj = collection.permissions
    ? { permissions: collection.permissions }
    : {};
  return {
    // @ts-expect-error need to refactor SchemaConfig type + id constant I think
    schema: collection.schema.toJSON() as Model,
    ...rulesObj,
    ...permissionsObj,
  };
}

import { Models } from '@triplit/db';
import { JSONSchema7 } from 'json-schema';
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';

// =============

const ajv = new Ajv({
  // options
  strict: true,
});

// @ts-expect-error - esm type error
addFormats(ajv);

/**
 * @deprecated Please use `exportCollectionsAsJSONSchema` instead.
 **/
export function exportCollectionAsJSONSchema(
  collections: Models,
  collectionName: string
): JSONSchema7 {
  return exportCollectionsAsJSONSchema(collections, collectionName);
}

/**
 * Export a triplit collection schema to valid JSON schema.
 * Permits using Triplit as the Main Source of Truth.
 * (JSON schema can be used by most popular data validation libs)
 **/
export function exportCollectionsAsJSONSchema(
  collections: Models,
  collectionName: string
): JSONSchema7 {
  return transformTriplitJsonDataInJsonSchema(collections, collectionName);
}

/**
 * Utility Function to iterate and export all collections.
 * Use `exportCollectionAsJSONSchema` for single collections
 **/
export function exportSchemaAsJSONSchema(
  collections: Models
): JSONSchema7 | undefined {
  //
  if (!collections) return undefined;

  const collectionsListJsonSchema: Record<string, JSONSchema7> = {};

  // copy and work on duplicate to keep original object unchanged
  const collectionsCpy = structuredClone(collections);

  for (const collectionKey in collectionsCpy) {
    //
    const collectionJsonSchema: JSONSchema7 =
      transformTriplitJsonDataInJsonSchema(collectionsCpy, collectionKey);

    collectionsListJsonSchema[collectionKey] = collectionJsonSchema;
  }

  return {
    title: 'JSON Schema of Triplit Schema',
    description: `version ${0}`,
    type: 'object',
    properties: {
      ...collectionsListJsonSchema,
    },
  };
}

export const transformFunctions = [
  transformPropertiesOptionalToRequired,
  transformDate,
  transformRecord,
  transformSet,
  transformConfig,
  stripNonSpecFields,
];

function stripNonSpecFields(object: any) {
  delete object['config'];
}

function transformTriplitJsonDataInJsonSchema(
  collections: Models,
  collection: string
) {
  // get collection
  const collectionToTransform = collections?.[collection].schema;

  const cloneToTransform = structuredClone(collectionToTransform);
  transformFunctions.map((transformFunc) => {
    transformObjectDeeply(cloneToTransform, transformFunc);
  });
  // evaluate to ensure it compiles
  // e.g. if triplit changes their format
  const schemaEvaluation = ajv.compile(cloneToTransform);

  if (schemaEvaluation.errors != null)
    throw new Error('Transform Error: Not a valid JSON schema.');

  // @ts-expect-error
  return cloneToTransform as JSONSchema7;
}

export function transformDate(object: any) {
  if (object.type === 'date') {
    object.type = 'string';
    object.format = 'date-time';
  }
  return object;
}

export function transformRecord(object: any) {
  if (object.type === 'record') {
    object.type = 'object';
  }
  return object;
}

export function transformSet(object: any) {
  if (object.type === 'set') {
    object.type = 'array';
    object.uniqueItems = true;
  }
  return object;
}

export function transformConfig(object: any) {
  if (object.config == null) return object;

  transformNullable(object);
  transformDefault(object);
  transformEnum(object);

  return object;
}

function transformNullable(object: any) {
  if (object?.config?.nullable === true || object?.config?.optional === true) {
    // nullable values are indicated as type: ["null"] in JSON schema
    if (Array.isArray(object.type) === false) {
      object.type = [object.type, 'null'];
    } else {
      // normally triplit's schema should just be a string, but
      // just in case it changes to allow array of types
      object.type.push('null');
    }
  }
}

function transformDefault(object: any) {
  // we set the default, though JSON Schema notes that it should be
  // only used for documentation / example values, not as form default
  if (object?.config?.default !== undefined) {
    if (object.config.default.func) {
      // Handle triplit's special cases: 'now' and 'uuid'
      object.default = object.config.default.func;
    } else {
      object.default = object.config.default;
    }
  }
  // }
}

function transformEnum(object: any) {
  if (object?.config?.enum != null) {
    object.enum = object?.config?.enum;
  }
}

export function transformPropertiesOptionalToRequired(object: any) {
  if (object.type === 'record') {
    const required = [];
    for (const key in object.properties) {
      const property = object.properties[key];
      if (!property?.config?.optional && !property?.config?.nullable) {
        required.push(key);
      }
    }
    required.sort();
    object.required = required;
  }

  return object;
}

export function transformObjectDeeply(
  object: any,
  transformFunction: Function,
  overlyingObj = {},
  currentObjKey = ''
) {
  // guard
  if (!object) return;
  if (typeof object !== 'object') return;

  // NOTE: we cant iterate over all keys and apply transformations
  // since this will miss keys with transforms that mutate keys (eg omitRelationship deltes keys)
  // instead, we must one transform after another to the whole object
  transformFunction.apply(null, [object, overlyingObj, currentObjKey]);

  if (object) {
    // Recursively apply to sub nodes
    for (const key in object) {
      // go a level deeper
      transformObjectDeeply(object[key], transformFunction, object, key);
    }
  }

  return object;
}

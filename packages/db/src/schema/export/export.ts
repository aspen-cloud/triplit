import { Models } from '../types';

import { JSONSchema7 } from 'json-schema';

import { schemaToJSON } from '../../../../db/src/schema/schema';

import {
  transformDate,
  transformRecord,
  transformSet,
  transformOptions,
  deleteRelationFields,
  transformPropertiesOptionalToRequired,
} from './transformFuncs';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { transformObjectDeeply } from './transformObjectDeeply.js';

// =============

const ajv = new Ajv({
  // options
  strict: true,
});

addFormats(ajv);

/**
 * Export a triplit collection schema to valid JSON schema.
 * Permits using Triplit as the Main Source of Truth.
 * (JSON schema can be used by most popular data validation libs)
 **/
export function exportCollectionAsJSONSchema(
  schema: Models<any, any>,
  collectionName: string
): JSONSchema7 {
  const triplitCollectionJsonData = schemaToJSON({
    collections: schema,
    version: 0,
  });

  return transformTriplitJsonDataInJsonSchema(
    triplitCollectionJsonData,
    collectionName
  );
}

/**
 * Utility Function to iterate and export all collections.
 * Use `exportCollectionAsJSONSchema` for single collections
 **/
export function exportSchemaAsJSONSchema(
  schema: Models<any, any>
): JSONSchema7 | undefined {
  //
  if (!schema) return undefined;
  const collectionsListJsonSchema: Record<string, JSONSchema7> = {};

  const triplitSchemaJsonData = schemaToJSON({
    collections: schema,
    version: 0,
  });

  for (const collectionKey in triplitSchemaJsonData?.collections) {
    //
    const collectionJsonSchema: JSONSchema7 =
      transformTriplitJsonDataInJsonSchema(
        triplitSchemaJsonData,
        collectionKey
      );

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
  // PRE: needs to run first as it might delete keys
  deleteRelationFields,
  // Mid:
  transformOptions,
  transformDate,
  transformRecord,
  transformSet,
  // POST: must run last since other functions might delete keys
  transformPropertiesOptionalToRequired,
];

function transformTriplitJsonDataInJsonSchema(
  triplitCollectionJsonData: Record<string, any>,
  collection: string
) {
  // get collection
  const collectionToTransform =
    triplitCollectionJsonData?.collections?.[collection].schema;

  const cloneToTransform = structuredClone(collectionToTransform);

  transformFunctions.map((transformFunc) => {
    transformObjectDeeply(cloneToTransform, transformFunc);
  });
  // evaluate to ensure it compiles
  // e.g. if triplit changes their format
  const schemaEvaluation = ajv.compile(cloneToTransform);

  if (schemaEvaluation.errors != null)
    throw new Error('Transform Error: Not a valid JSON schema.');

  return cloneToTransform;
}

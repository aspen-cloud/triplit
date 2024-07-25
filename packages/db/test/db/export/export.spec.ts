import { describe, expect, test } from 'vitest';

import { JSONSchema7 } from 'json-schema';

import {
  exportSchemaAsJSONSchema,
  exportCollectionAsJSONSchema,
} from '../../../src/schema/export/json-schema/export.js';

import { schema } from './exhaustive-test-schema';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({
  // options
  strict: true,
  // allErrors: true,
});
addFormats(ajv);

describe('Full JSON Compliance Test', () => {
  //
  test('Single Collection: JSON Draft 07 Compliance', () => {
    const jsonSchemaCollection: JSONSchema7 = exportCollectionAsJSONSchema(
      schema,
      'optional'
    );
    // validate schema
    const schemaEvaluation = ajv.compile(jsonSchemaCollection);

    expect(schemaEvaluation?.errors).toBe(null);
  });

  test('Single Collection: Expected Output Data', () => {
    const jsonSchemaCollection: JSONSchema7 = exportCollectionAsJSONSchema(
      schema,
      'optional'
    );
    // validate schema
    const expectedOutput = {
      type: 'object',
      properties: {
        id: {
          type: 'string',
        },
        boolean: {
          type: 'boolean',
        },
        string: {
          type: 'string',
        },
        number: {
          type: 'number',
        },
        date: {
          type: 'string',
          format: 'date-time',
        },
        set_string: {
          type: 'array',
          items: {
            type: 'string',
          },
          uniqueItems: true,
        },
        set_number: {
          type: 'array',
          items: {
            type: 'number',
          },
          uniqueItems: true,
        },
        set_boolean: {
          type: 'array',
          items: {
            type: 'boolean',
          },
          uniqueItems: true,
        },
        set_date: {
          type: 'array',
          items: {
            type: 'string',
            format: 'date-time',
          },
          uniqueItems: true,
        },
        object: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            boolean: {
              type: 'boolean',
            },
            string: {
              type: 'string',
            },
            number: {
              type: 'number',
            },
            date: {
              type: 'string',
              format: 'date-time',
            },
            set_string: {
              type: 'array',
              items: {
                type: 'string',
              },
              uniqueItems: true,
            },
            set_number: {
              type: 'array',
              items: {
                type: 'number',
              },
              uniqueItems: true,
            },
            set_boolean: {
              type: 'array',
              items: {
                type: 'boolean',
              },
              uniqueItems: true,
            },
            set_date: {
              type: 'array',
              items: {
                type: 'string',
                format: 'date-time',
              },
              uniqueItems: true,
            },
          },
        },
      },
      required: ['object'],
    };

    expect(jsonSchemaCollection).toEqual(expectedOutput);
  });

  test('Collection Defaults w/ Enum: JSON Draft 07 Compliance', () => {
    const jsonSchemaCollection: JSONSchema7 = exportCollectionAsJSONSchema(
      schema,
      'defaults'
    );

    // validate data schema
    const schemaEvaluation = ajv.compile(jsonSchemaCollection);

    expect(schemaEvaluation?.errors).toBe(null);
  });

  test('All Collections Export: JSON Draft 07 Compliance', () => {
    const jsonSchemaOfCollections = exportSchemaAsJSONSchema(schema);
    // validate schema
    const schemaEvaluation = ajv.compile(jsonSchemaOfCollections);

    expect(schemaEvaluation?.errors).toBe(null);
  });
});

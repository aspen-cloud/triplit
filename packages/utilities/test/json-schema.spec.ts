import { describe, expect, test } from 'vitest';
import { JSONSchema7 } from 'json-schema';
import {
  exportSchemaAsJSONSchema,
  exportCollectionsAsJSONSchema,
} from '../src/json-schema.js';
import { schema } from './utils/exhaustive-schema.js';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({
  // options
  strict: true,
  // allErrors: true,
});
addFormats(ajv);

describe('Full JSON Compliance Test', () => {
  test('Single Collection: JSON Draft 07 Compliance', () => {
    const jsonSchemaCollection: JSONSchema7 = exportCollectionsAsJSONSchema(
      schema,
      'optional'
    );

    // validate schema
    const schemaEvaluation = ajv.compile(jsonSchemaCollection);

    expect(schemaEvaluation?.errors).toBe(null);
  });

  test('Single Collection: Expected Output Data', () => {
    const jsonSchemaCollection: JSONSchema7 = exportCollectionsAsJSONSchema(
      schema,
      'plain'
    );
    // validate schema
    const expectedOutput = {
      type: 'object',
      properties: {
        id: {
          default: 'uuid',
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
        json: {},
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
              default: 'uuid',
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
            json: {},
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
          required: [
            'boolean',
            'date',
            'id',
            'json',
            'number',
            'set_boolean',
            'set_date',
            'set_number',
            'set_string',
            'string',
          ],
        },
      },
      required: [
        'boolean',
        'date',
        'id',
        'json',
        'number',
        'object',
        'set_boolean',
        'set_date',
        'set_number',
        'set_string',
        'string',
      ],
    };
    expect(jsonSchemaCollection).toEqual(expectedOutput);
  });

  test('Collection Defaults w/ Enum: JSON Draft 07 Compliance', () => {
    const jsonSchemaCollection: JSONSchema7 = exportCollectionsAsJSONSchema(
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

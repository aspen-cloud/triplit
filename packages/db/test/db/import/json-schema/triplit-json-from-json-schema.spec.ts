import { describe, expect, test, vi } from 'vitest';

import { schema as exhaustiveTestTriplitSchema } from '../../export/exhaustive-test-schema';

import {
  schemaToJSON,
  exportSchemaAsJSONSchema,
  triplitJsonFromJsonSchema,
} from '../../../../src/';
import { JSONSchema7 } from 'json-schema';
import { exampleTestOfjsonSchemaFromZodSchema } from './exampleTestOfjsonSchemaFromZodSchema';

describe('Essential Tests', () => {
  test('All Collections: convert Triplit schema back and forth, plus validation', () => {
    // 0. convert the triplit schema into triplit's own json format
    // so it is comparable
    const originalTriplitJson = schemaToJSON({
      collections: exhaustiveTestTriplitSchema,
      version: 0,
    });

    // 0. filter out the relation fields, since they are only for inter-linking
    // fields/collections and json schema has no representation for it
    const originalTriplitJson_WithoutRelationFields =
      duplicateWithoutAncestorsWithKey(originalTriplitJson, 'cardinality');

    // 1. export the Triplit Schema as JSON Schema
    const jsonSchema = exportSchemaAsJSONSchema(exhaustiveTestTriplitSchema);
    if (!jsonSchema) throw new Error('Schema not exported');

    // 2. Then reverse and import the JSON Schema again as Triplit JSON schema
    const importedTriplitJsonFormat = triplitJsonFromJsonSchema(jsonSchema);

    // 3. check if it the same as the original
    expect(importedTriplitJsonFormat).toEqual(
      originalTriplitJson_WithoutRelationFields
    );
  });

  test('patternProperties and dependencies should be omitted', () => {
    //
    const jsonSchemaComprensiveTest = {
      title: 'Comprehensive Test Schema',
      description:
        'A schema to test various features of JSON Schema validation',
      type: 'object',
      properties: {
        objectTests: {
          type: 'object',
          properties: {
            objectWithPatternProperties: {
              type: 'object',
              properties: {},
              dependencies: {},
              dependentRequired: { credit_card: ['billing_address'] },
              dependentSchemas: {
                credit_card: {
                  properties: { billing_address: { type: 'string' } },
                  required: ['billing_address'],
                },
              },
              patternProperties: {
                '^S_': {
                  type: 'string',
                },
                '^I_': {
                  type: 'integer',
                },
              },
              additionalProperties: false,
            },
          },
        },
      },
    };

    const output = triplitJsonFromJsonSchema(
      jsonSchemaComprensiveTest as JSONSchema7
    );

    expect(output).toEqual({
      collections: {
        objectTests: {
          schema: {
            type: 'record',
            properties: {
              objectWithPatternProperties: {
                type: 'record',
                properties: {},
                additionalProperties: false,
              },
            },
            optional: ['objectWithPatternProperties'],
          },
        },
      },
      version: 0,
    });
    // .toThrowError(
    //   "'patternProperties' are not supported by Triplit - please remove them from your JSON data"
    // );
  });

  test('defaultFillIn=false should not copy over default values', () => {
    //
    const jsonSchemaComprensiveTest = {
      title: 'Comprehensive Test Schema',
      description:
        'A schema to test various features of JSON Schema validation',
      type: 'object',
      properties: {
        booleanTest: {
          type: 'boolean',
          default: false,
        },
      },
    };

    const output = triplitJsonFromJsonSchema(
      jsonSchemaComprensiveTest as JSONSchema7,
      false
    );

    expect(output).toEqual({
      collections: {
        booleanTest: {
          schema: {
            type: 'boolean',
            options: {},
          },
        },
      },
      version: 0,
    });
  });

  test('if omittedProperties > 0 should show warning', () => {
    //
    const jsonSchemaComprensiveTest = {
      title: 'Comprehensive Test Schema',
      description:
        'A schema to test various features of JSON Schema validation',
      type: 'object',
      properties: {
        objectTests: {
          type: 'object',
          properties: {
            objectWithDependencies: {
              type: 'object',
              properties: {
                credit_card: {
                  type: 'number',
                },
                billing_address: {
                  type: 'string',
                },
              },
              dependencies: {
                credit_card: ['billing_address'],
              },
            },
          },
        },
      },
    };

    const warnSpy = vi.spyOn(console, 'warn');

    const output = triplitJsonFromJsonSchema(
      jsonSchemaComprensiveTest as JSONSchema7
    );

    expect(warnSpy).toHaveBeenCalled();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/not supported/i)
    );

    // restore the original console.warn function
    warnSpy.mockRestore();
  });

  test('array constrains should be omitted', () => {
    //
    const jsonSchemaComprensiveTest = {
      title: 'Comprehensive Test Schema',
      description:
        'A schema to test various features of JSON Schema validation',
      type: 'object',
      properties: {
        notUniqueArrayTests: {
          type: 'object',
          properties: {
            simpleArray: {
              type: 'array',
              items: {
                type: 'string',
              },
              uniqueItems: true,
              maxContains: 3,
            },
            arrayWithMinItems: {
              type: 'array',
              items: {
                type: 'number',
              },
              uniqueItems: true,
              minItems: 2,
            },
          },
        },
      },
    };

    const output = triplitJsonFromJsonSchema(
      jsonSchemaComprensiveTest as JSONSchema7
    );

    expect(output).toEqual({
      collections: {
        notUniqueArrayTests: {
          schema: {
            type: 'record',
            properties: {
              simpleArray: {
                type: 'set',
                items: {
                  type: 'string',
                  options: {},
                },
                options: {},
              },
              arrayWithMinItems: {
                type: 'set',
                items: {
                  type: 'number',
                  options: {},
                },
                options: {},
              },
            },
            optional: ['arrayWithMinItems', 'simpleArray'],
          },
        },
      },
      version: 0,
    });
  });

  test('normal array type should throw with message', () => {
    //
    const jsonSchemaComprensiveTest = {
      title: 'Comprehensive Test Schema',
      description:
        'A schema to test various features of JSON Schema validation',
      type: 'object',
      properties: {
        notUniqueArrayTests: {
          type: 'object',
          properties: {
            simpleArray: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
          },
        },
      },
    };

    expect(() => {
      // debugger;
      const output = triplitJsonFromJsonSchema(
        jsonSchemaComprensiveTest as JSONSchema7
      );
    }).toThrowError(
      'Only array types with uniqueItems = true are supported, since Triplit only yet supports set type'
    );
  });

  test('tuple array type should throw with message', () => {
    //
    const jsonSchemaComprensiveTest = {
      title: 'Comprehensive Test Schema',
      description:
        'A schema to test various features of JSON Schema validation',
      type: 'object',
      properties: {
        notUniqueArrayTests: {
          type: 'object',
          properties: {
            tupleArray: {
              type: 'array',
              items: [
                {
                  type: 'number',
                },
                {
                  type: 'string',
                },
                {
                  type: 'boolean',
                },
              ],
              additionalItems: false,
            },
          },
        },
      },
    };

    expect(() => {
      // debugger;
      const output = triplitJsonFromJsonSchema(
        jsonSchemaComprensiveTest as JSONSchema7
      );
    }).toThrowError(
      'Only array types with uniqueItems = true are supported, since Triplit only yet supports set type'
    );
  });

  test('"if / then / else" conditionals should be omitted', () => {
    //
    const jsonSchemaComprensiveTest = {
      title: 'Comprehensive Test Schema',
      description:
        'A schema to test various features of JSON Schema validation',
      type: 'object',
      properties: {
        conditionalTest: {
          type: 'object',
          properties: {
            userType: {
              type: 'string',
            },
          },
          if: {
            properties: {
              userType: {
                const: 'admin',
              },
            },
          },
          then: {
            properties: {
              adminCode: {
                type: 'string',
              },
            },
            required: ['adminCode'],
          },
          else: {
            properties: {
              userCode: {
                type: 'string',
              },
            },
            required: ['userCode'],
          },
        },
      },
    };

    const output = triplitJsonFromJsonSchema(
      jsonSchemaComprensiveTest as JSONSchema7
    );

    expect(output).toEqual({
      collections: {
        conditionalTest: {
          schema: {
            type: 'record',
            properties: {
              userType: {
                type: 'string',
                options: {},
              },
            },
            optional: ['userType'],
          },
        },
      },
      version: 0,
    });
  });

  test('"allOf / anyOf / oneOf / not" should error with message', () => {
    //
    const jsonSchemaComprensiveTest = {
      title: 'Comprehensive Test Schema',
      description:
        'A schema to test various features of JSON Schema validation',
      type: 'object',
      properties: {
        combinationTests: {
          type: 'object',
          properties: {
            allOfTest: {
              allOf: [
                {
                  type: 'object',
                  properties: {
                    name: {
                      type: 'string',
                    },
                  },
                },
                {
                  type: 'object',
                  properties: {
                    age: {
                      type: 'integer',
                    },
                  },
                },
              ],
            },
            anyOfTest: {
              anyOf: [
                {
                  type: 'string',
                  maxLength: 5,
                },
                {
                  type: 'number',
                  minimum: 0,
                },
              ],
            },
            oneOfTest: {
              oneOf: [
                {
                  type: 'number',
                  multipleOf: 5,
                },
                {
                  type: 'number',
                  multipleOf: 3,
                },
              ],
            },
            notTest: {
              not: {
                type: 'integer',
              },
            },
          },
        },
      },
    };

    expect(() => {
      const output = triplitJsonFromJsonSchema(
        jsonSchemaComprensiveTest as any
      );
    }).toThrowError(
      "Combinations like 'allOf / anyOf / oneOf / not' are not supported by Triplit - please remove them from your JSON data"
    );
  });

  test('$ref should throw error', () => {
    //
    const jsonSchemaComprensiveTest = {
      title: 'Comprehensive Test Schema',
      description:
        'A schema to test various features of JSON Schema validation',
      type: 'object',
      properties: {
        referencesTest: {
          type: 'object',
          properties: {
            pet: {
              $ref: '#/definitions/Pet',
            },
          },
        },
      },
    };

    expect(() => {
      const output = triplitJsonFromJsonSchema(
        jsonSchemaComprensiveTest as JSONSchema7
      );
    }).toThrowError(
      "'$ref' are not supported by Triplit - please remove them from your JSON data"
    );
  });

  test('JSON Schema test object should not throw', () => {
    //
    const jsonSchemaComprensiveTest = {
      title: 'Comprehensive Test Schema',
      description:
        'A schema to test various features of JSON Schema validation',
      type: 'object',
      properties: {
        stringTests: {
          type: 'object',
          properties: {
            simpleString: {
              type: 'string',
            },
            enumString: {
              type: 'string',
              enum: ['red', 'green', 'blue'],
            },
            formatEmail: {
              type: 'string',
              format: 'email',
            },
            formatDate: {
              type: 'string',
              format: 'date',
            },
          },
          required: ['simpleString', 'stringWithPattern'],
        },
        numberTests: {
          type: 'object',
          properties: {
            integerType: {
              type: 'integer',
            },
            numberType: {
              type: 'number',
            },
            integerEnum: {
              type: 'integer',
              enum: [1, 2, 3, 5, 8],
            },
          },
        },
        booleanTest: {
          type: 'boolean',
        },
        nullTest: {
          type: 'null',
        },
        arrayTests: {
          type: 'object',
          properties: {
            arrayWithUniqueItems: {
              type: 'array',
              items: {
                type: 'integer',
              },
              uniqueItems: true,
            },
          },
        },
        objectTests: {
          type: 'object',
          properties: {
            simpleObject: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                },
                age: {
                  type: 'integer',
                },
              },
              required: ['name'],
            },
            objectWithDependencies: {
              type: 'object',
              properties: {
                credit_card: {
                  type: 'number',
                },
                billing_address: {
                  type: 'string',
                },
              },
              dependencies: {
                credit_card: ['billing_address'],
              },
            },
          },
        },
      },
      required: ['stringTests', 'numberTests', 'booleanTest', 'arrayTests'],
      definitions: {
        Pet: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
            },
            age: {
              type: 'integer',
            },
            species: {
              type: 'string',
              enum: ['dog', 'cat', 'fish'],
            },
          },
          required: ['name', 'species'],
        },
      },
    };

    expect(() => {
      const output = triplitJsonFromJsonSchema(
        jsonSchemaComprensiveTest as JSONSchema7
      );
    }).not.toThrow();
  });
});

describe('Additional Compatibility Tests (partially from LLM claude sonnet 3.5 generation, but heavily corrected)', () => {
  test('Complex nested structures', () => {
    const complexNestedSchema: JSONSchema7 = {
      type: 'object',
      properties: {
        level1: {
          type: 'object',
          properties: {
            level2: {
              type: 'object',
              properties: {
                level3: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    value: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    };

    const result = triplitJsonFromJsonSchema(complexNestedSchema);
    expect(result?.collections.level1.schema.type).toBe('record');
    expect(result?.collections.level1.schema.properties.level2.type).toBe(
      'record'
    );
    expect(
      result?.collections.level1.schema.properties.level2.properties.level3.type
    ).toBe('record');
  });

  test('Triplit Set can only hold primitives/scalars, not objects/records', () => {
    const arrayWithObjs: JSONSchema7 = {
      type: 'object',
      properties: {
        arrayObject: {
          type: 'array',
          uniqueItems: true,
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              value: { type: 'number' },
            },
          },
        },
      },
    };

    expect(() => {
      triplitJsonFromJsonSchema(arrayWithObjs);
    }).toThrowError(
      "Arrays that hold objects or tuples are not supported, as Triplit's Set can only have primitives - please remove them from your JSON data"
    );
  });

  test('String formats', () => {
    const stringFormatsSchema: JSONSchema7 = {
      type: 'object',
      properties: {
        dateTime: { type: 'string', format: 'date-time' },
        uri: { type: 'string', format: 'uri' },
        ipv4: { type: 'string', format: 'ipv4' },
        ipv6: { type: 'string', format: 'ipv6' },
        regularString: { type: 'string' },
      },
    };

    const result = triplitJsonFromJsonSchema(stringFormatsSchema);
    expect(result?.collections.dateTime.schema.type).toBe('date');
    expect(result?.collections.uri.schema.type).toBe('string');
    expect(result?.collections.uri.schema.format).toBe('uri');
    expect(result?.collections.ipv4.schema.type).toBe('string');
    expect(result?.collections.ipv4.schema.format).toBe('ipv4');
    expect(result?.collections.ipv6.schema.type).toBe('string');
    expect(result?.collections.ipv6.schema.format).toBe('ipv6');
    expect(result?.collections.regularString.schema.type).toBe('string');
  });

  test('Number constraints', () => {
    const numberConstraintsSchema: JSONSchema7 = {
      type: 'object',
      properties: {
        exclusiveMinMax: {
          type: 'number',
          exclusiveMinimum: 0,
          exclusiveMaximum: 100,
        },
      },
    };

    // expect(() => {
    //   triplitJsonFromJsonSchema(numberConstraintsSchema);
    // }).toThrowError(
    //   'JSON number constraints ("6.2. Validation Keywords for Numeric Instances (number and integer)") are not supported by Triplit - please remove them from your JSON data'
    // );

    const output = triplitJsonFromJsonSchema(
      numberConstraintsSchema as JSONSchema7
    );

    expect(output).toEqual({
      collections: {
        exclusiveMinMax: {
          schema: {
            type: 'number',
            options: {},
          },
        },
      },
      version: 0,
    });
  });

  test('Number constraints 2', () => {
    const numberConstraintsSchema: JSONSchema7 = {
      type: 'object',
      properties: {
        numberWithMultipleOf: {
          type: 'number',
          multipleOf: 0.5,
        },
        numberWithRange: {
          type: 'number',
          minimum: 0,
          maximum: 100,
        },
      },
    };

    // expect(() => {
    //   triplitJsonFromJsonSchema(numberConstraintsSchema);
    // }).toThrowError(
    //   'JSON number constraints ("6.2. Validation Keywords for Numeric Instances (number and integer)") are not supported by Triplit - please remove them from your JSON data'
    // );

    const output = triplitJsonFromJsonSchema(
      numberConstraintsSchema as JSONSchema7
    );

    expect(output).toEqual({
      collections: {
        numberWithMultipleOf: {
          schema: {
            type: 'number',
            options: {},
          },
        },
        numberWithRange: {
          schema: {
            type: 'number',
            options: {},
          },
        },
      },
      version: 0,
    });
  });

  test('Date: not supported formats', () => {
    const numberConstraintsSchema: JSONSchema7 = {
      type: 'object',
      properties: {
        dateTime: {
          type: 'string',
          format: 'time',
        },
        dateDuration: {
          type: 'string',
          format: 'duration',
        },
      },
    };

    expect(() => {
      triplitJsonFromJsonSchema(numberConstraintsSchema);
    }).toThrowError(
      'date formats "time" and "duration" are not supported by Triplit - please remove them from your JSON data'
    );
  });

  describe('const not supported', () => {
    test('const not supported', () => {
      //
      const jsonSchemaComprensiveTest = {
        type: 'object',
        properties: {
          constNumber: { type: 'number', const: 42 },
        },
      };

      expect(() => {
        triplitJsonFromJsonSchema(jsonSchemaComprensiveTest as JSONSchema7);
      }).toThrowError(
        'const type is not supported by Triplit - please remove them from your JSON data'
      );
    });

    test('any const named key should pass', () => {
      //
      const jsonSchemaComprensiveTest = {
        type: 'object',
        properties: {
          const: { type: 'number' },
        },
      };

      expect(() => {
        triplitJsonFromJsonSchema(jsonSchemaComprensiveTest as JSONSchema7);
      }).not.toThrow();
    });
  });

  test('Array and Set constraints', () => {
    const arraySchema: JSONSchema7 = {
      type: 'object',
      properties: {
        uniqueArray: {
          type: 'array',
          uniqueItems: true,
          items: { type: 'string' },
          minItems: 2,
          maxItems: 5,
        },
        regularArray: {
          type: 'array',
          items: { type: 'number' },
          minItems: 1,
          maxItems: 10,
          uniqueItems: true,
        },
      },
    };

    // expect(() => {
    //   triplitJsonFromJsonSchema(arraySchema);
    // }).toThrowError(
    //   'JSON array constraints ("6.4. Validation Keywords for Arrays") are not supported by Triplit - please remove them from your JSON data'
    // );

    const output = triplitJsonFromJsonSchema(arraySchema as JSONSchema7);

    expect(output).toEqual({
      collections: {
        uniqueArray: {
          schema: {
            type: 'set',
            items: {
              type: 'string',
              options: {},
            },
            options: {},
          },
        },
        regularArray: {
          schema: {
            type: 'set',
            items: {
              type: 'number',
              options: {},
            },
            options: {},
          },
        },
      },
      version: 0,
    });
  });

  test('type object requires properties', () => {
    const objectSchema: JSONSchema7 = {
      type: 'object',
      properties: {
        subObject: {
          type: 'object',
          // properties: {},
        },
      },
    };

    const result = expect(() =>
      triplitJsonFromJsonSchema(objectSchema)
    ).toThrowError(
      'each type object requires a properties field for Triplit Schema to process it'
    );
  });

  test('Object constraints', () => {
    const objectSchema: JSONSchema7 = {
      type: 'object',
      properties: {
        constrainedObject: {
          type: 'object',
          minProperties: 1,
          maxProperties: 5,
          properties: {},
        },
      },
    };

    // expect(() => {
    //   const output = triplitJsonFromJsonSchema(objectSchema);
    // }).toThrowError(
    //   'JSON object constraints ("6.5. Validation Keywords for Objects") are not supported by Triplit - please remove them from your JSON data'
    // );

    const output = triplitJsonFromJsonSchema(objectSchema);

    expect(output).toEqual({
      collections: {
        constrainedObject: {
          schema: {
            type: 'record',
            properties: {},
          },
        },
      },
      version: 0,
    });
  });

  test('string constraints', () => {
    const jsonSchemaComprensiveTest: JSONSchema7 = {
      type: 'object',
      properties: {
        stringTests: {
          type: 'object',
          properties: {
            simpleString: {
              type: 'string',
            },
            stringWithMinLength: {
              type: 'string',
              minLength: 5,
            },
            stringWithMaxLength: {
              type: 'string',
              maxLength: 10,
            },
            stringWithPattern: {
              type: 'string',
              pattern: '^[A-Z][a-z]+$',
            },
            enumString: {
              type: 'string',
              enum: ['red', 'green', 'blue'],
            },
            formatEmail: {
              type: 'string',
              format: 'email',
            },
            formatDate: {
              type: 'string',
              format: 'date',
            },
          },
        },
      },
    };

    // expect(() => {
    //   triplitJsonFromJsonSchema(jsonSchemaComprensiveTest);
    // }).toThrowError(
    //   'JSON string constraints (" 6.3. Validation Keywords for Strings ") are not supported by Triplit - please remove them from your JSON data'
    // );

    const output = triplitJsonFromJsonSchema(
      jsonSchemaComprensiveTest as JSONSchema7
    );

    expect(output).toEqual({
      collections: {
        stringTests: {
          schema: {
            type: 'record',
            properties: {
              simpleString: {
                type: 'string',
                options: {},
              },
              stringWithMinLength: {
                type: 'string',
                options: {},
              },
              stringWithMaxLength: {
                type: 'string',
                options: {},
              },
              stringWithPattern: {
                type: 'string',
                options: {},
              },
              enumString: {
                type: 'string',
                options: {
                  enum: ['red', 'green', 'blue'],
                },
              },
              formatEmail: {
                type: 'string',
                format: 'email',
                options: {},
              },
              formatDate: {
                options: {},
                type: 'date',
              },
            },
            optional: [
              'enumString',
              'formatDate',
              'formatEmail',
              'simpleString',
              'stringWithMaxLength',
              'stringWithMinLength',
              'stringWithPattern',
            ],
          },
        },
      },
      version: 0,
    });
  });

  test('Null type handling', () => {
    const nullableSchema: JSONSchema7 = {
      type: 'object',
      properties: {
        nullableString: { type: ['string', 'null'] },
        nullType: { type: 'null' },
      },
    };

    const result = triplitJsonFromJsonSchema(nullableSchema);
    expect(result?.collections.nullableString.schema.type).toBe('string');
    expect(result?.collections.nullableString.schema.options.nullable).toBe(
      true
    );
    expect(result?.collections.nullType.schema.type).toBe('string');
    expect(result?.collections.nullType.schema.options.nullable).toBe(true);
    expect(result?.collections.nullType.schema.options.default).toBe(null);
  });

  test('Default value handling', () => {
    const defaultValueSchema: JSONSchema7 = {
      type: 'object',
      properties: {
        stringWithDefault: { type: 'string', default: 'default value' },
        uuidField: { type: 'string', default: 'uuid' },
        dateField: { type: 'string', format: 'date-time', default: 'now' },
      },
    };

    const result = triplitJsonFromJsonSchema(defaultValueSchema);
    expect(result?.collections.stringWithDefault.schema.options.default).toBe(
      'default value'
    );
    expect(result?.collections.uuidField.schema.options.default).toEqual({
      func: 'uuid',
      args: null,
    });
    expect(result?.collections.dateField.schema.options.default).toEqual({
      func: 'now',
      args: null,
    });
  });

  test('Enum handling', () => {
    const enumSchema: JSONSchema7 = {
      type: 'object',
      properties: {
        enumField: { type: 'string', enum: ['a', 'b', 'c'] },
      },
    };

    const result = triplitJsonFromJsonSchema(enumSchema);
    expect(result?.collections.enumField.schema.options.enum).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  test('Required fields conversion', () => {
    const jsonSchemaComprensiveTest = {
      title: 'Comprehensive Test Schema',
      description:
        'A schema to test various features of JSON Schema validation',
      type: 'object',
      properties: {
        requiredToOptionalField: {
          type: 'object',
          properties: {
            requiredField: { type: 'string' },
            optionalField: { type: 'number' },
          },
          required: ['requiredField'],
        },
      },
    };

    const result = triplitJsonFromJsonSchema(
      jsonSchemaComprensiveTest as JSONSchema7
    );

    expect(result?.collections.requiredToOptionalField.schema.optional).toEqual(
      ['optionalField']
    );
  });

  test('Unicode handling', () => {
    const unicodeSchema: JSONSchema7 = {
      type: 'object',
      properties: {
        日本語: { type: 'string' },
        Français: { type: 'number' },
        Русский: { type: 'boolean' },
      },
    };

    const result = triplitJsonFromJsonSchema(unicodeSchema);
    expect(result?.collections['日本語'].schema.type).toBe('string');
    expect(result?.collections['Français'].schema.type).toBe('number');
    expect(result?.collections['Русский'].schema.type).toBe('boolean');
  });

  test('Error handling for unsupported features', () => {
    const unsupportedSchemas = [
      {
        type: 'object',
        properties: {
          patternProp: {
            type: 'object',
            patternProperties: {
              '^S_': { type: 'string' },
            },
          },
        },
      },
      {
        type: 'object',
        properties: {
          conditional: {
            if: { properties: { a: { type: 'string' } } },
            then: { properties: { b: { type: 'number' } } },
            else: { properties: { c: { type: 'boolean' } } },
          },
        },
      },
      {
        type: 'object',
        properties: {
          combined: {
            allOf: [
              { properties: { a: { type: 'string' } } },
              { properties: { b: { type: 'number' } } },
            ],
          },
        },
      },
      {
        type: 'object',
        properties: {
          ref: {
            $ref: '#/definitions/SomeDefinition',
          },
        },
      },
    ];

    unsupportedSchemas.forEach((schema, index) => {
      expect(() => triplitJsonFromJsonSchema(schema as any)).toThrow();
    });
  });

  test('Performance with large schema', () => {
    const largeSchema: JSONSchema7 = {
      type: 'object',
      properties: Object.fromEntries(
        Array.from({ length: 1000 }, (_, i) => [
          `field${i}`,
          { type: 'string' },
        ])
      ),
    };

    const startTime = performance.now();
    const result = triplitJsonFromJsonSchema(largeSchema);
    const endTime = performance.now();

    expect(result).toBeDefined();
    expect(Object.keys(result?.collections || {}).length).toBe(1000);
    expect(endTime - startTime).toBeLessThan(1000); // Assuming less than 1 second is acceptable
  });

  test('custom error has details object for debugging', () => {
    // try {
    //   triplitJsonFromJsonSchema(
    //     exampleTestOfjsonSchemaFromZodSchema as JSONSchema7
    //   );
    // } catch (err) {
    //   // debugger;
    // }
    try {
      triplitJsonFromJsonSchema({
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          // TODO: write test for empty objects?
          unknown: {},
        },
        additionalProperties: false,
        // add test? no, this is not valid json schema
        // default: {
        //   string: 'hello',
        // },
        description: 'watup',
      } as JSONSchema7);
      // debugger;
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err.details).toBeDefined(); // Check that `details` exists
    }
  });
});

describe('Compatibility against real JSONSchemas', () => {
  test('Zod JsonSchema Export (from zodToJsonSchema)', () => {
    // try {
    //   triplitJsonFromJsonSchema(
    //     exampleTestOfjsonSchemaFromZodSchema as JSONSchema7
    //   );
    // } catch (err) {
    //   // debugger;
    // }
    expect(() =>
      triplitJsonFromJsonSchema(
        exampleTestOfjsonSchemaFromZodSchema as JSONSchema7
      )
    ).not.toThrow();
  });
});

function duplicateWithoutAncestorsWithKey(obj: any, keyToOmit: string) {
  // Check if the key exists in the current object
  if (keyToOmit in obj) {
    return null; // Return null to indicate this object should be omitted
  }

  // Create a new object to hold the filtered result
  const result: any = {};

  for (const key in obj) {
    const value = obj[key];
    if (
      typeof value === 'object' &&
      value !== null &&
      Array.isArray(value) === false &&
      key !== 'options'
      // original keeps empty options obj
    ) {
      const nestedResult = duplicateWithoutAncestorsWithKey(value, keyToOmit);
      // Only add the nested result if it's not null
      if (nestedResult !== null) {
        result[key] = nestedResult;
      }
    } else {
      result[key] = value; // Add primitive values directly
    }
  }

  // Return the result if there are any keys left, otherwise return null
  return Object.keys(result).length > 0 ? result : null;
}

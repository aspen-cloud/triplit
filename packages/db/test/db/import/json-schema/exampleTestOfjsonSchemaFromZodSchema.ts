// from https://github.com/StefanTerdell/zod-to-json-schema/blob/master/test/allParsers.test.ts
// but elements that throw are removed

export const exampleTestOfjsonSchemaFromZodSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    array: {
      type: 'array',
      uniqueItems: true,
      items: {
        type: 'string',
      },
    },
    arrayMin: {
      type: 'array',
      uniqueItems: true,
      minItems: 1,
      items: {
        type: 'string',
      },
    },
    arrayMax: {
      type: 'array',
      uniqueItems: true,
      maxItems: 1,
      items: {
        type: 'string',
      },
    },
    arrayMinMax: {
      type: 'array',
      uniqueItems: true,
      minItems: 1,
      maxItems: 1,
      items: {
        type: 'string',
      },
    },
    bigInt: {
      type: 'integer',
      format: 'int64',
    },
    boolean: {
      type: 'boolean',
    },
    date: {
      type: 'string',
      format: 'date-time',
    },
    // default: {
    //   default: 42,
    // },
    effectRefine: {
      type: 'string',
    },
    effectTransform: {
      type: 'string',
    },
    effectPreprocess: {
      type: 'string',
    },
    enum: {
      type: 'string',
      enum: ['hej', 'svejs'],
    },
    literal: {
      type: 'string',
    },
    nativeEnum: {
      type: 'number',
      enum: [0, 1, 2],
    },
    null: {
      type: 'null',
    },
    nullablePrimitive: {
      type: ['string', 'null'],
    },
    number: {
      type: 'number',
    },
    numberGt: {
      type: 'number',
      exclusiveMinimum: 1,
    },
    numberLt: {
      type: 'number',
      exclusiveMaximum: 1,
    },
    numberGtLt: {
      type: 'number',
      exclusiveMinimum: 1,
      exclusiveMaximum: 1,
    },
    numberGte: {
      type: 'number',
      minimum: 1,
    },
    numberLte: {
      type: 'number',
      maximum: 1,
    },
    numberGteLte: {
      type: 'number',
      minimum: 1,
      maximum: 1,
    },
    numberMultipleOf: {
      type: 'number',
      multipleOf: 2,
    },
    numberInt: {
      type: 'integer',
    },
    objectPasstrough: {
      type: 'object',
      properties: {
        foo: {
          type: 'string',
        },
        bar: {
          type: 'number',
        },
      },
      required: ['foo'],
      additionalProperties: true,
    },
    objectCatchall: {
      type: 'object',
      properties: {
        foo: {
          type: 'string',
        },
        bar: {
          type: 'number',
        },
      },
      required: ['foo'],
      additionalProperties: {
        type: 'boolean',
      },
    },
    objectStrict: {
      type: 'object',
      properties: {
        foo: {
          type: 'string',
        },
        bar: {
          type: 'number',
        },
      },
      required: ['foo'],
      additionalProperties: false,
    },
    objectStrip: {
      type: 'object',
      properties: {
        foo: {
          type: 'string',
        },
        bar: {
          type: 'number',
        },
      },
      required: ['foo'],
      additionalProperties: false,
    },
    promise: {
      type: 'string',
    },
    recordStringBoolean: {
      type: 'object',
      properties: {},
      additionalProperties: {
        type: 'boolean',
      },
    },
    set: {
      type: 'array',
      uniqueItems: true,
      items: {
        type: 'string',
      },
    },
    string: {
      type: 'string',
    },
    stringMin: {
      type: 'string',
      minLength: 1,
    },
    stringMax: {
      type: 'string',
      maxLength: 1,
    },
    stringEmail: {
      type: 'string',
      format: 'email',
    },
    stringEmoji: {
      type: 'string',
      pattern: '^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$',
    },
    stringUrl: {
      type: 'string',
      format: 'uri',
    },
    stringUuid: {
      type: 'string',
      format: 'uuid',
    },
    stringRegEx: {
      type: 'string',
      pattern: 'abc',
    },
    stringCuid: {
      type: 'string',
      pattern: '^[cC][^\\s-]{8,}$',
    },
    unionPrimitives: {
      type: ['string', 'number', 'boolean', 'integer', 'null'],
    },
    unionPrimitiveLiterals: {
      type: ['number', 'string', 'null', 'boolean'],
      enum: [123, 'abc', null, true],
    },
    // TODO: write test for empty objects?
    // unknown: {},
  },
  additionalProperties: false,
  // add test? no, this is not valid json schema
  // default: {
  //   string: 'hello',
  // },
  description: 'watup',
};

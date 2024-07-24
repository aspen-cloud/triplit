import { describe, expect, test } from 'vitest';

import {
  transformDate,
  transformRecord,
  transformSet,
  transformOptions,
  deleteRelationFields,
  transformPropertiesOptionalToRequired,
} from '../../../src/schema/export/transformFuncs';

import { transformObjectDeeply } from '../../../src/schema/export/transformObjectDeeply';
import { transformFunctions } from '../../../src/schema/export/export';

describe('transformDate', () => {
  test('transforms only date type', () => {
    const input = { type: 'date' };
    const output = transformDate(input);
    expect(output).toEqual({ type: 'string', format: 'date-time' });
  });
});

describe('transformRecord', () => {
  test('transforms only record type to object type', () => {
    const input = { type: 'record' };
    const output = transformRecord(input);
    expect(output).toEqual({ type: 'object' });
  });
});

describe('transformOptions', () => {
  test('should set default', () => {
    const input = {
      type: 'string',
      options: {
        nullable: false,
        default: 'Hello World',
      },
    };
    const output = transformOptions(input);
    expect(output).toEqual({
      type: 'string',
      default: 'Hello World',
    });
  });

  test('null added correctly if nullable true', () => {
    const input = {
      type: 'string',
      options: {
        nullable: true,
      },
    };
    const output = transformOptions(input);
    expect(output).toEqual({ type: ['string', 'null'] });
  });

  test('null not added if nullable false', () => {
    const input = {
      type: 'string',
      options: {
        nullable: false,
      },
    };
    const output = transformOptions(input);
    expect(output).toEqual({ type: 'string' });
  });

  test('handle if default is an object', () => {
    const input = {
      type: 'string',
      options: {
        nullable: true,
        default: { func: 'uuid', args: null },
      },
    };
    const output = transformOptions(input);
    expect(output).toEqual({ type: ['string', 'null'] });
  });
});

describe('transformSet', () => {
  test('rename type set to array', () => {
    const input = { type: 'set' };
    const output = transformSet(input);
    expect(output).toEqual({ type: 'array', uniqueItems: true });
    // expect(output).toHaveProperty('uniqueItems', true);
  });

  test('add unique prop', () => {
    const input = { type: 'set' };
    const output = transformSet(input);
    expect(output).toHaveProperty('uniqueItems', true);
  });
});

describe('transformOptionalToRequired', () => {
  test('add required with only the fields not marked as optional', () => {
    //
    const input = {
      properties: {
        check: { type: 'boolean ' },
        field: { type: 'string' },
        numbers: { type: 'number' },
        set_number: {
          type: 'set',
          items: { type: 'number', options: {} },
          options: {},
        },
      },
      optional: ['field', 'numbers'],
    };
    const output = transformPropertiesOptionalToRequired(input);

    expect(output).toEqual({
      properties: {
        check: { type: 'boolean ' },
        field: { type: 'string' },
        numbers: { type: 'number' },
        set_number: {
          type: 'set',
          items: { type: 'number', options: {} },
          options: {},
        },
      },
      required: ['check', 'set_number'],
    });
  });

  test('add required field to all properties when optional is not present', () => {
    //
    const input = {
      properties: {
        check: { type: 'boolean ' },
        field: { type: 'string' },
        numbers: { type: 'number' },
        set_number: {
          type: 'set',
          items: { type: 'number', options: {} },
          options: {},
        },
      },
    };
    const output = transformPropertiesOptionalToRequired(input);

    expect(output).toEqual({
      properties: {
        check: { type: 'boolean ' },
        field: { type: 'string' },
        numbers: { type: 'number' },
        set_number: {
          type: 'set',
          items: { type: 'number', options: {} },
          options: {},
        },
      },
      required: ['check', 'field', 'numbers', 'set_number'],
    });
  });

  test('does not modify object without a properties field', () => {
    //
    const input = { stringField: 'Hello World', numbers: [1, 2, 3] };
    const output = transformPropertiesOptionalToRequired(input);
    expect(output).toEqual({
      stringField: 'Hello World',
      numbers: [1, 2, 3],
    });
  });
});

describe('deleteRelationFields', () => {
  test('Should return the object but empty', () => {
    const input = { relationField: { cardinality: 'one' } };
    // HACK: can't use deleteRelationFields directly since it won't reference correct input object
    const output = transformObjectDeeply(input, deleteRelationFields, {});
    expect(output).toEqual({});
  });
});

// ---------------------------

describe('Test all Transforms together', () => {
  test('enums', () => {
    const input = {
      properties: {
        stringEnum: {
          type: 'string',
          options: {
            enum: ['a', 'b', 'c'],
            default: 'a',
          },
        },
        set_stringEnum: {
          type: 'set',
          items: {
            type: 'string',
            options: {
              enum: ['a', 'b', 'c'],
            },
          },
          options: {},
        },
      },
    };

    const expectedOutput = {
      properties: {
        stringEnum: {
          type: 'string',
          default: 'a',
          enum: ['a', 'b', 'c'],
        },
        set_stringEnum: {
          type: 'array',
          uniqueItems: true,
          items: {
            type: 'string',
            enum: ['a', 'b', 'c'],
          },
        },
      },
      required: ['stringEnum', 'set_stringEnum'],
    };

    transformFunctions.forEach((transformFunc) => {
      transformObjectDeeply(input, transformFunc);
    });

    expect(input).toEqual(expectedOutput);
  });

  //
  test('Complex Test Case', () => {
    const input = {
      properties: {
        stringType: {
          type: 'string',
          options: {
            default: 'Hello',
          },
        },
        recordType: { value: 1, obj: { type: 'record' } },
        obj: { type: 'date' },
        relation: { cardinality: 'many' },
        id: {
          type: 'string',
          options: {
            nullable: true,
            default: { func: 'uuid', args: null },
          },
        },
        set_string: {
          type: 'set',
          items: {
            type: 'string',
            options: {},
          },
          options: {},
        },
        set_number: {
          type: 'set',
          items: {
            type: 'number',
            options: {},
          },
          options: {},
        },

        stringEnum: {
          type: 'string',
          options: {
            enum: ['a', 'b', 'c'],
            default: 'a',
          },
        },
        set_stringEnum: {
          type: 'set',
          items: {
            type: 'string',
            options: {
              enum: ['a', 'b', 'c'],
            },
          },
          options: {},
        },
      },
      optional: ['stringType', 'set_string'],
    };

    const expectedOutput = {
      properties: {
        stringType: {
          type: 'string',
          default: 'Hello',
        },
        recordType: { value: 1, obj: { type: 'object' } },
        obj: { type: 'string', format: 'date-time' },
        id: {
          type: ['string', 'null'],
        },

        set_string: {
          type: 'array',
          uniqueItems: true,
          items: {
            type: 'string',
          },
        },

        set_number: {
          type: 'array',
          uniqueItems: true,
          items: {
            type: 'number',
          },
        },

        stringEnum: {
          type: 'string',
          default: 'a',
          enum: ['a', 'b', 'c'],
        },

        set_stringEnum: {
          type: 'array',
          uniqueItems: true,
          items: {
            type: 'string',
            enum: ['a', 'b', 'c'],
          },
        },
      },
      required: [
        'recordType',
        'obj',
        'id',
        'set_number',
        'stringEnum',
        'set_stringEnum',
      ],
    };

    transformFunctions.forEach((transformFunc) => {
      transformObjectDeeply(input, transformFunc);
    });

    expect(input).toEqual(expectedOutput);
  });

  test('do not add relation type fiels to required list', () => {
    const input = {
      properties: {
        id: {
          type: 'string',
          options: {
            nullable: true,
            default: { func: 'uuid', args: null },
          },
        },
        recordType: { value: 1, obj: { type: 'record' } },
        relation: { cardinality: 'one' }, // should be automatically stripped and not optional
      },
    };

    const expectedOutput = {
      properties: {
        id: {
          type: ['string', 'null'],
        },
        recordType: { value: 1, obj: { type: 'object' } },
      },
      required: ['id', 'recordType'],
    };

    transformFunctions.forEach((transformFunc) => {
      transformObjectDeeply(input, transformFunc);
    });

    expect(input).toEqual(expectedOutput);
  });
});

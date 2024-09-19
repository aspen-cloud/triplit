import { describe, expect, test } from 'vitest';

import {
  invertTransformDate,
  invertTransformRecord,
  invertTransformSet,
  invertTransformOptions,
  invertTransformations,
  handleIdKey,
  transformPropertiesRequiredToOptional,
} from '../../../../src/schema/import/json-schema/invert-transform-functions';

describe('invertTransformDate', () => {
  test('inverts only string type with date-time format', () => {
    const input = { type: 'string', format: 'date-time' };
    const output = invertTransformDate(input);
    expect(output).toEqual({ type: 'date' });
  });

  test('does not modify non-date-time fields', () => {
    const input = { type: 'string' };
    const output = invertTransformDate(input);
    expect(output).toEqual({ type: 'string' });
  });
});

describe('invertTransformRecord', () => {
  test('inverts only object type to record type', () => {
    const input = { type: 'object' };
    const output = invertTransformRecord(input);
    expect(output).toEqual({ type: 'record' });
  });

  test('does not modify non-object types', () => {
    const input = { type: 'string' };
    const output = invertTransformRecord(input);
    expect(output).toEqual({ type: 'string' });
  });
});

describe('invertTransformSet', () => {
  test('inverts array type with uniqueItems to set', () => {
    const input = {
      type: 'array',
      items: {
        type: 'number',
      },
      uniqueItems: true,
    };
    const output = invertTransformSet(input);
    expect(output).toEqual({
      type: 'set',
      items: {
        type: 'number',
        options: {},
      },
      options: {},
    });
  });

  test('inverts array type with nullable items', () => {
    const input = {
      type: ['array', 'null'],
      items: {
        type: 'number',
      },
      uniqueItems: true,
    };
    const output = invertTransformSet(input);
    expect(output).toEqual({
      type: 'set',
      items: {
        type: 'number',
        options: {},
      },
      options: {
        nullable: true,
      },
    });
  });

  test('set of string enum', () => {
    const input = {
      type: 'array',
      items: {
        type: 'string',
        enum: ['a', 'b', 'c'],
      },
      uniqueItems: true,
    };

    const output = invertTransformSet(input);
    expect(output).toEqual({
      type: 'set',
      items: {
        type: 'string',
        options: {
          enum: ['a', 'b', 'c'],
        },
      },
      options: {},
    });
  });

  test('set of string enum with default', () => {
    const input = {
      type: 'array',
      items: {
        type: 'string',
        default: 'a',
        enum: ['a', 'b', 'c'],
      },
      uniqueItems: true,
    };
    let output = invertTransformSet(input);
    output = invertTransformOptions(input);
    expect(output).toEqual({
      type: 'set',
      items: {
        type: 'string',
        options: {
          default: 'a',
          enum: ['a', 'b', 'c'],
        },
      },
      options: {},
    });
  });

  test('does not modify non-set arrays', () => {
    const input = { type: 'array' };
    const output = invertTransformSet(input);
    expect(output).toEqual({ type: 'array' });
  });

  // test('inverts nested items', () => {
  //   const input = {
  //     type: 'array',
  //     uniqueItems: true,
  //     items: { type: 'string', format: 'date-time' },
  //   };
  //   const output = invertTransformSet(input);
  //   expect(output).toEqual({
  //     type: 'set',
  //     items: {
  //       type: 'date',
  //       options: {},
  //     },
  //   });
  // });
});

describe('default handling', () => {
  test('fill in default if set to true/none', () => {
    const input = {
      type: 'string',
      default: 'Only example text for Documentation as intended by JSON schema',
    };

    const output = invertTransformOptions(input);
    expect(output).toEqual({
      type: 'string',
      options: {
        default:
          'Only example text for Documentation as intended by JSON schema',
      },
    });
  });

  test('do not fill in default if set to false', () => {
    const input = {
      type: 'string',
      default: 'Only example text for Documentation as intended by JSON schema',
    };

    const output = invertTransformOptions(input, false);
    expect(output).toEqual({
      type: 'string',
      options: {},
    });
  });

  describe('respect default of type number', () => {
    test('have number type as default, not string', () => {
      const input = { type: 'number', default: 1 };

      // @ts-ignore otherwise json schema type error, but ok here since
      // we only need to check if type is correct
      const output = invertTransformations(input);

      expect(output).toEqual({
        type: 'number',
        options: {
          default: 1,
        },
      });
    });
  });
});

describe('Triplit special key handling', () => {
  // test('"id" key should be transformed to triplit JSON data id automatically (or skipped if an option like that is added)', () => {
  //   const input = {
  //     id: {
  //       type: 'string',
  //     },
  //   };

  //   const output = handleIdKey(input);

  //   expect(output).toEqual({
  //     id: {
  //       type: 'string',
  //       options: {
  //         nullable: false,
  //         default: {
  //           func: 'uuid',
  //           args: null,
  //         },
  //       },
  //     },
  //   });
  // });

  test('uuid in default as special signal to convert to Triplit special function', () => {
    const input = {
      type: 'string',
      default: 'uuid',
    };

    // @ts-ignore
    const output = invertTransformations(input);

    expect(output).toEqual({
      type: 'string',
      options: {
        default: {
          func: 'uuid',
          args: null,
        },
        nullable: false,
      },
    });
  });

  test('now in default as special signal to convert to Triplit special function', () => {
    const input = {
      type: 'string',
      format: 'date-time',
      default: 'now',
    };

    // @ts-ignore
    const output = invertTransformations(input);

    expect(output).toEqual({
      type: 'date',
      options: {
        default: {
          func: 'now',
          args: null,
        },
      },
    });
  });

  // test('now in large collection', () => {
  //   const input = {
  //     type: 'object',
  //     properties: {
  //       id: {
  //         type: 'string',
  //         default: 'uuid',
  //       },
  //       boolean: {
  //         type: 'boolean',
  //       },
  //       string: {
  //         type: 'string',
  //         default: 'a string',
  //       },
  //       stringEnum: {
  //         type: 'string',
  //         default: 'a',
  //         enum: ['a', 'b', 'c'],
  //       },
  //       stringEnumOptional: {
  //         type: 'string',
  //         enum: ['a', 'b', 'c'],
  //       },
  //       number: {
  //         type: 'number',
  //         default: 1,
  //       },
  //       date: {
  //         type: 'string',
  //         format: 'date-time',
  //         default: 'now',
  //       },
  //       set_string: {
  //         type: 'array',
  //         items: {
  //           type: 'string',
  //           default: '1',
  //         },
  //         uniqueItems: true,
  //       },
  //       set_number: {
  //         type: 'array',
  //         items: {
  //           type: 'number',
  //           default: 1,
  //         },
  //         uniqueItems: true,
  //       },
  //       set_boolean: {
  //         type: 'array',
  //         items: {
  //           type: 'boolean',
  //         },
  //         uniqueItems: true,
  //       },
  //       set_date: {
  //         type: 'array',
  //         items: {
  //           type: 'string',
  //           format: 'date-time',
  //           default: 'now',
  //         },
  //         uniqueItems: true,
  //       },
  //       set_stringEnum: {
  //         type: 'array',
  //         items: {
  //           type: 'string',
  //           default: 'a',
  //           enum: ['a', 'b', 'c'],
  //         },
  //         uniqueItems: true,
  //       },
  //       object: {
  //         type: 'object',
  //         properties: {
  //           id: {
  //             type: 'string',
  //             default: 'uuid',
  //           },
  //           boolean: {
  //             type: 'boolean',
  //           },
  //           string: {
  //             type: 'string',
  //             default: 'a string',
  //           },
  //           number: {
  //             type: 'number',
  //             default: 1,
  //           },
  //           date: {
  //             type: 'string',
  //             format: 'date-time',
  //             default: 'now',
  //           },
  //           set_number: {
  //             type: 'array',
  //             items: {
  //               type: 'number',
  //               default: 1,
  //             },
  //             uniqueItems: true,
  //           },
  //           set_boolean: {
  //             type: 'array',
  //             items: {
  //               type: 'boolean',
  //             },
  //             uniqueItems: true,
  //           },
  //           set_date: {
  //             type: 'array',
  //             items: {
  //               type: 'string',
  //               format: 'date-time',
  //               default: 'now',
  //             },
  //             uniqueItems: true,
  //           },
  //           set_string: {
  //             type: 'array',
  //             items: {
  //               type: 'string',
  //               default: '1',
  //             },
  //             uniqueItems: true,
  //           },
  //           set_stringEnum: {
  //             type: 'array',
  //             items: {
  //               type: 'string',
  //               default: 'a',
  //               enum: ['a', 'b', 'c'],
  //             },
  //             uniqueItems: true,
  //           },
  //         },
  //         required: [
  //           'boolean',
  //           'date',
  //           'id',
  //           'number',
  //           'set_boolean',
  //           'set_date',
  //           'set_number',
  //           'set_string',
  //           'set_stringEnum',
  //           'string',
  //         ],
  //       },
  //     },
  //     required: [
  //       'boolean',
  //       'date',
  //       'id',
  //       'number',
  //       'object',
  //       'set_boolean',
  //       'set_date',
  //       'set_number',
  //       'set_string',
  //       'set_stringEnum',
  //       'string',
  //       'stringEnum',
  //     ],
  //   };

  //   // @ts-ignore
  //   const output = invertTransformations(input);
  //   debugger;
  //   expect(output).toEqual({
  //     type: 'date',
  //     options: {
  //       default: {
  //         func: 'now',
  //         args: null,
  //       },
  //     },
  //   });
  // });
  //
});

describe('invertTransformOptions', () => {
  test('options object in TriplitSchema needs always be present, even if empty', () => {
    const input = {
      type: 'string',
    };
    const output = invertTransformOptions(input);
    expect(output).toEqual({
      type: 'string',
      options: {},
    });
  });

  test('moves default to options', () => {
    const input = {
      type: 'string',
      default: 'Hello World',
    };
    const output = invertTransformOptions(input);
    expect(output).toEqual({
      type: 'string',
      options: {
        default: 'Hello World',
      },
    });
  });

  test('adds nullable option if type includes null', () => {
    const input = { type: ['string', 'null'] };
    const output = invertTransformOptions(input);
    expect(output).toEqual({
      type: 'string',
      options: {
        nullable: true,
      },
    });
  });

  test('moves enum to options', () => {
    const input = {
      type: 'string',
      enum: ['a', 'b', 'c'],
    };
    const output = invertTransformOptions(input);
    expect(output).toEqual({
      type: 'string',
      options: {
        enum: ['a', 'b', 'c'],
      },
    });
  });

  test('combines multiple options', () => {
    const input = {
      type: ['string', 'null'],
      default: 'Hello World',
      enum: ['Hello World', 'Goodbye'],
    };
    const output = invertTransformOptions(input);
    expect(output).toEqual({
      type: 'string',
      options: {
        nullable: true,
        default: 'Hello World',
        enum: ['Hello World', 'Goodbye'],
      },
    });
  });
});

describe('tramsform required to optional', () => {
  test('add optional array for fields not marked as required', () => {
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
      required: ['check', 'set_number'],
    };

    const output = transformPropertiesRequiredToOptional(input);

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
      optional: ['field', 'numbers'],
    });
  });

  test('does not modify object without a properties field', () => {
    //
    const input = { stringField: 'Hello World', numbers: [1, 2, 3] };

    const output = transformPropertiesRequiredToOptional(input);

    expect(output).toEqual({
      stringField: 'Hello World',
      numbers: [1, 2, 3],
    });
  });
});

// TODO: do a full invertTransformations on data
// describe('invertTransformations', () => {
//   test('applies all invert transformations', () => {

// const input = {
//   title: 'JSON Schema of Triplit Schema',
//   description: 'version 0',
//   type: 'object',
//   properties: {
//     numberTest: {
//       type: 'number',
//       default: 1,
//     },
//   },
// };

//     const input = {
//       type: 'object',
//       properties: {
//         date: { type: 'string', format: 'date-time' },
//         set: { type: 'array', uniqueItems: true, items: { type: 'string' } },
//         enum: { type: ['string', 'null'], enum: ['a', 'b', 'c'], default: 'a' },
//       },
//     };
//     const output = invertTransformations(input);
//     expect(output).toEqual({
//       type: 'record',
//       properties: {
//         date: { type: 'date' },
//         set: { type: 'set', items: { type: 'string' } },
//         enum: {
//           type: 'string',
//           options: {
//             nullable: true,
//             enum: ['a', 'b', 'c'],
//             default: 'a',
//           },
//         },
//       },
//     });
//   });

//   test('handles nested structures', () => {
//     const input = {
//       type: 'object',
//       properties: {
//         nested: {
//           type: 'object',
//           properties: {
//             date: { type: 'string', format: 'date-time' },
//           },
//         },
//       },
//     };
//     const output = invertTransformations(input);
//     expect(output).toEqual({
//       type: 'record',
//       properties: {
//         nested: {
//           type: 'record',
//           properties: {
//             date: { type: 'date' },
//           },
//         },
//       },
//     });
//   });
// });

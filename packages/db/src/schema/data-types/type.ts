import { nanoid } from 'nanoid';
import {
  DataType,
  TypeConfig,
  ValidateOptions,
  PrimitiveType,
  ValueType,
  DefaultValue,
  DefaultFunction,
} from './types/index.js';
import {
  DBDeserializationError,
  DBSerializationError,
  JSONDeserializationError,
  JSONSerializationError,
  TriplitError,
  UnrecognizedAttributeTypeError,
} from '../../errors.js';
import {
  BooleanType,
  DateType,
  NumberType,
  RecordProps,
  RecordType,
  SetType,
  StringType,
} from './definitions/index.js';
import { SUPPORTED_OPERATIONS } from './operations.js';

export namespace Type {
  /**
   * Returns an empty object for the given type
   * If the type is not a record, it returns undefined
   */
  export function struct(type: DataType) {
    switch (type.type) {
      case 'record':
        const result: any = {};
        for (const key in type.properties) {
          result[key] = Type.struct(type.properties[key]);
        }
        return result;
      default:
        return undefined;
    }
  }

  /**
   * Returns the default value for the given type
   * If no default is provided, it returns undefined
   * If the type is a record, it returns an object with the default values for each property
   */
  export function defaultValue(type: DataType) {
    if (isValueType(type)) return calcDefaultValue(type.config);
    if (type.type === 'record') {
      const result: any = {};
      for (const key in type.properties) {
        result[key] = Type.defaultValue(type.properties[key]);
      }
      return result;
    }
    return undefined;
  }

  /**
   * Assigns the values of the input to the target object if they match the data type
   * If the value at the input is undefined, the default is used as a fallback
   */
  // TODO: should handle nullable and optional the same
  export function assign(type: DataType, target: any, input: any) {
    switch (type.type) {
      case 'record':
        for (const key in type.properties) {
          // TODO: try to get propeties return DataType, not any
          // TODO: play around with default not being {} for TypeConfig, causing type.config: any
          const property = type.properties[key];
          // If the property is optional and no input is provided, set to undefined so property exists
          if (isOptional(property) && hasNoValue(input[key])) {
            target[key] = input[key];
            continue;
          }
          target[key] = Type.assign(property, target[key], input[key]);
        }
        return target;
      default:
        return input === undefined ? Type.defaultValue(type) : input;
    }
  }

  /**
   * Encodes an input value based on the given data type
   *
   * Will accept a partial object
   *
   * TODO: evaluate if partial should be default or configurable
   */
  export function encode(type: DataType, input: any): any {
    if (isOptional(type) && hasNoValue(input)) {
      return undefined;
    }
    if (isValueType(type)) {
      switch (type.type) {
        case 'boolean':
          if (typeof input === 'boolean') return input;
          throw new DBSerializationError('boolean', input);
        case 'date':
          if (input instanceof Date && !isNaN(input.getTime()))
            return input.toISOString();
          if (typeof input === 'string' && !Number.isNaN(Date.parse(input)))
            return new Date(input).toISOString();
          if (typeof input === 'number' && !Number.isNaN(input))
            return new Date(input).toISOString();
          throw new DBSerializationError('date', input);
        case 'number':
          if (typeof input === 'number') return input;
          throw new DBSerializationError('number', input);
        case 'string':
          if (typeof input === 'string') {
            if (type.config?.enum) {
              if (type.config?.enum.includes(input)) return input;
            } else {
              return input;
            }
          }
          // TODO: specify enum values in error message
          throw new DBSerializationError('string', input);
        case 'set':
          if (Array.isArray(input))
            return Object.fromEntries(
              input.map((v) => [Type.collectionKeyEncode(type.items, v), true])
            );
          if (input instanceof Set)
            return Object.fromEntries(
              Array.from(input).map((v) => [
                Type.collectionKeyEncode(type.items, v),
                true,
              ])
            );
          // accept an already encoded set
          if (typeof input === 'object' && input !== null) {
            //TODO: do we need to perform encoding / implicit validation?
            return input;
          }
          throw new DBSerializationError(`set<${type.items.type}>`, input);
        default:
          throw new UnrecognizedAttributeTypeError(
            // @ts-expect-error
            type.type,
            'Failed to encode value'
          );
      }
    } else if (type.type === 'record') {
      if (typeof input === 'object' && input !== null) {
        for (const key in input) {
          const property = type.properties[key];
          if (!property) {
            throw new DBSerializationError(
              'record',
              input,
              `Unrecognized property: ${key}`
            );
          }

          // If the property is optional and input is empty, skip
          // TODO: should we drop if value is undefined?
          if (isOptional(property) && hasNoValue(input[key])) continue;

          input[key] = Type.encode(property, input[key]);
        }

        return input;
      }
      throw new DBSerializationError('record', input);
    }
    throw new UnrecognizedAttributeTypeError(
      // @ts-expect-error
      type.type,
      'Failed to encode value'
    );
  }

  export function validateEncoded(
    type: DataType,
    encoded: any,
    options: ValidateOptions
  ): { valid: boolean; error?: string } {
    if (isValueType(type)) {
      switch (type.type) {
        case 'boolean':
          if (typeof encoded === 'boolean') return { valid: true };
          return {
            valid: false,
            error: encodedValueMismatchMessage('boolean', encoded),
          };
        case 'date':
          if (typeof encoded === 'string') return { valid: true };
          return {
            valid: false,
            error: encodedValueMismatchMessage('date', encoded),
          };
        case 'number':
          if (typeof encoded === 'number') return { valid: true };
          return {
            valid: false,
            error: encodedValueMismatchMessage('number', encoded),
          };
        case 'string':
          if (typeof encoded === 'string') return { valid: true };
          return {
            valid: false,
            error: encodedValueMismatchMessage('string', encoded),
          };
        case 'set':
          // TODO: should there be more validation of Record<string, boolean>?
          if (typeof encoded === 'object' && encoded !== null)
            return { valid: true };
          return {
            valid: false,
            error: encodedValueMismatchMessage(
              `set<${type.items.type}>`,
              encoded
            ),
          };
      }
      throw new UnrecognizedAttributeTypeError(
        // @ts-expect-error
        type.type,
        'Failed to validate value'
      );
    } else if (type.type === 'record') {
      for (const key in type.properties) {
        const property = type.properties[key];
        // Optioanl properties should have no value
        if (isOptional(property) && hasNoValue(encoded[key])) continue;
        // NOTE: may become == because null is equivalent to undefined
        if (options.partial && !(key in encoded)) continue;
        const validation = Type.validateEncoded(
          property,
          encoded[key],
          options
        );
        if (!validation.valid) return validation;
      }
      return { valid: true };
    }
    throw new UnrecognizedAttributeTypeError(
      // @ts-expect-error
      type.type,
      'Failed to validate value'
    );
  }

  export function decode(type: DataType, encoded: any): any {
    if (isValueType(type)) {
      switch (type.type) {
        case 'boolean':
          if (typeof encoded === 'boolean') return encoded;
          throw new DBDeserializationError('boolean', encoded);
        case 'date':
          if (typeof encoded === 'string') return new Date(encoded);
          throw new DBDeserializationError('date', encoded);
        case 'number':
          if (typeof encoded === 'number') return encoded;
          throw new DBDeserializationError('number', encoded);
        case 'string':
          if (typeof encoded === 'string') return encoded;
          throw new DBDeserializationError('string', encoded);
        case 'set':
          if (typeof encoded === 'object')
            return new Set(
              Object.entries(encoded)
                .filter(([_, v]) => v)
                .map(([k, _]) => Type.collectionKeyDecode(type.items, k))
            );
          throw new DBDeserializationError(`set<${type.items.type}>`, encoded);
      }
      throw new UnrecognizedAttributeTypeError(
        // @ts-expect-error
        type.type,
        'Failed to decode value'
      );
    } else if (type.type === 'record') {
      const result: any = {};
      for (const key in encoded) {
        const property = type.properties[key];
        // If the property is optional and no input is provided, decode as value if null
        if (isOptional(property) && hasNoValue(encoded[key])) {
          if (encoded[key] === null) result[key] = null;
          continue;
        }
        result[key] = Type.decode(property, encoded[key]);
      }
      return result;
    }
    throw new UnrecognizedAttributeTypeError(
      // @ts-expect-error
      type.type,
      'Failed to decode value'
    );
  }

  // FOR SET KEYS
  // Must encode to string
  export function collectionKeyEncode(type: DataType, input: any): string {
    if (!isPrimitiveType(type))
      throw new TriplitError(
        'Cannot encode collection key for non-primitive type'
      );
    return Type.encode(type, input).toString();
  }
  // From string
  export function collectionKeyDecode(type: DataType, encoded: string) {
    if (!isPrimitiveType(type))
      throw new TriplitError(
        'Cannot decode collection key for non-primitive type'
      );
    if (type.type === 'number') return Number(encoded);
    if (type.type === 'boolean') return encoded === 'true';
    return Type.decode(type, encoded);
  }

  export function equal(a: DataType, b: DataType) {
    if (a.type === 'boolean' && b.type === 'boolean') return booleanEqual(a, b);
    if (a.type === 'date' && b.type === 'date') return dateEqual(a, b);
    if (a.type === 'number' && b.type === 'number') return numberEqual(a, b);
    if (a.type === 'record' && b.type === 'record') return recordEqual(a, b);
    if (a.type === 'set' && b.type === 'set') return setEqual(a, b);
    if (a.type === 'string' && b.type === 'string') return stringEqual(a, b);
    return false;
  }

  export function serialize(
    type: DataType,
    input: any,
    inputFormat: 'encoded' | 'decoded'
  ): any {
    if (type.type === 'date') {
      if (inputFormat === 'encoded') return input;
      if (inputFormat === 'decoded') return Type.encode(type, input);
      throw new TriplitError('Invalid data format: ' + inputFormat);
    }
    if (type.type === 'record') {
      // TODO: could also perform in place
      const serialized: any = {};
      for (const key in input) {
        const property = type.properties[key];
        if (!property)
          throw new JSONSerializationError(
            'record',
            input,
            `Unrecognized property: ${key}`
          );
        if (isOptional(property) && hasNoValue(input[key])) continue;
        serialized[key] = Type.serialize(property, input[key], inputFormat);
      }
      return serialized;
    }
    if (type.type === 'set') {
      if (inputFormat === 'encoded') {
        return Object.entries(input)
          .filter(([_, v]) => v)
          .map(([k, _]) =>
            Type.serialize(
              type.items,
              Type.collectionKeyDecode(type.items, k),
              inputFormat
            )
          );
      }
      if (inputFormat === 'decoded') {
        const serialized = [];
        for (const decodedValue of input) {
          serialized.push(
            Type.serialize(type.items, decodedValue, inputFormat)
          );
        }
        return serialized;
      }
      throw new TriplitError('Invalid data format: ' + inputFormat);
    }
    return input;
  }
  export function deserialize(
    type: DataType,
    input: any,
    outputFormat: 'encoded' | 'decoded'
  ): any {
    if (type.type === 'date') {
      if (outputFormat === 'encoded') return input;
      if (outputFormat === 'decoded') return Type.decode(type, input);
      throw new TriplitError('Invalid data format: ' + outputFormat);
    }
    if (type.type === 'record') {
      for (const key in input) {
        const property = type.properties[key];
        if (!property)
          throw new JSONDeserializationError(
            'record',
            input,
            `Unrecognized property: ${key}`
          );
        if (isOptional(property) && hasNoValue(input[key])) continue;
        input[key] = Type.deserialize(property, input[key], outputFormat);
      }
      return input;
    }
    if (type.type === 'set') {
      if (outputFormat === 'encoded') {
        const encoded: Record<string, boolean> = {};
        for (const serializedValue of input) {
          encoded[Type.collectionKeyEncode(type.items, serializedValue)] = true;
        }
        return encoded;
      }
      if (outputFormat === 'decoded') {
        const decoded = [];
        // TODO: need to understand the serialzed and deserialzied values here, seems to be Record
        for (const serializedValue of input) {
          decoded.push(
            Type.deserialize(type.items, serializedValue, outputFormat)
          );
        }
        return new Set(decoded);
      }
      throw new TriplitError('Invalid data format: ' + outputFormat);
    }
    return input;
  }

  export function supportedOperations(type: DataType): ReadonlyArray<string> {
    if (type.type === 'boolean') return SUPPORTED_OPERATIONS.boolean;
    if (type.type === 'date') return SUPPORTED_OPERATIONS.date;
    if (type.type === 'number') return SUPPORTED_OPERATIONS.number;
    if (type.type === 'record') return SUPPORTED_OPERATIONS.record;
    if (type.type === 'set')
      return [
        ...SUPPORTED_OPERATIONS.set,
        ...Type.supportedOperations(type.items),
      ];
    if (type.type === 'string') return SUPPORTED_OPERATIONS.string;
    throw new UnrecognizedAttributeTypeError(
      // @ts-expect-error
      type.type,
      'Failed to get supported operations'
    );
  }
}

export function isValueType(type: DataType): type is ValueType {
  return type.type !== 'record';
}

export function isPrimitiveType(type: DataType): type is PrimitiveType {
  return type.type !== 'record' && type.type !== 'set';
}

function calcDefaultValue(config: TypeConfig) {
  let attributeDefault = config.default;
  if (hasNoValue(attributeDefault)) {
    // no default object
    return undefined;
  }
  if (typeof attributeDefault !== 'object' || attributeDefault === null)
    return attributeDefault;
  else {
    const { args, func } = attributeDefault;
    if (func === 'uuid') {
      return args && typeof args[0] === 'number' ? nanoid(args[0]) : nanoid();
    } else if (func === 'now') {
      return new Date().toISOString();
    } else if (func === 'Set.empty') {
      return {};
    }
  }
  return undefined;
}

export function hasNoValue(value: any): value is null | undefined {
  return value === null || value === undefined;
}

export function isOptional(type: DataType) {
  return type.config?.optional === true || type.config?.nullable === true;
}

export function encodedValueMismatchMessage(type: string, value: any) {
  return `Encoded value ${value} is not valid for type ${type}`;
}

function recordEqual(a: RecordType, b: RecordType) {
  if (!propertiesEqual(a.properties, b.properties)) return false;
  return true;
}

function booleanEqual(a: BooleanType, b: BooleanType) {
  return typeConfigEqual(a.config, b.config);
}

function dateEqual(a: DateType, b: DateType) {
  return typeConfigEqual(a.config, b.config);
}

function numberEqual(a: NumberType, b: NumberType) {
  return typeConfigEqual(a.config, b.config);
}

function setEqual(a: SetType, b: SetType) {
  if (!typeConfigEqual(a.config, b.config)) return false;
  if (!Type.equal(a.items, b.items)) return false;
  return true;
}

function stringEqual(a: StringType, b: StringType) {
  if (a.config?.enum && !b.config?.enum) return false;
  if (!a.config?.enum && b.config?.enum) return false;
  if (a.config?.enum && b.config?.enum) {
    if (a.config.enum.length !== b.config.enum.length) return false;
    for (const value of a.config.enum) {
      if (!b.config.enum.includes(value)) return false;
    }
  }
  return typeConfigEqual(a.config, b.config);
}

function propertiesEqual(a: RecordProps<any, any>, b: RecordProps<any, any>) {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!b[key]) return false;
    if (!Type.equal(a[key], b[key])) return false;
  }
  return true;
}

function typeConfigEqual(a: TypeConfig | undefined, b: TypeConfig | undefined) {
  if (!!a?.optional !== !!b?.optional) return false;
  if (!!a?.nullable !== !!b?.nullable) return false;
  if (!typeDefaultEqual(a?.default, b?.default)) return false;
  return true;
}

function typeDefaultEqual(
  a: DefaultValue | undefined,
  b: DefaultValue | undefined
) {
  if (typeof a !== typeof b) return false;
  if (isDefaultFunction(a) && isDefaultFunction(b)) {
    return defaultFunctionEqual(a, b);
  }
  return a === b;
}

function isDefaultFunction(value: DefaultValue | undefined) {
  return typeof value === 'object' && value !== null && 'func' in value;
}

function defaultFunctionEqual(a: DefaultFunction, b: DefaultFunction) {
  if (a.func !== b.func) return false;
  if (a.args?.length !== b.args?.length) return false;
  if (a.args && b.args) {
    for (let i = 0; i < a.args.length; i++) {
      if (a.args[i] !== b.args[i]) return false;
    }
  }
  return true;
}

function emptyConfig(): TypeConfig {
  return {
    default: undefined,
    nullable: undefined,
    optional: undefined,
  };
}

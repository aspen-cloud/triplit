import { Static, Type } from '@sinclair/typebox';
import { nanoid } from 'nanoid';
import {
  TypeJSONParseError,
  UnrecognizedAttributeTypeError,
} from '../errors.js';
import { Value } from '@sinclair/typebox/value';
import {
  UserTypeOptionsSchema,
  UserTypeOptions,
  AttributeDefinition,
  ValueAttributeDefinition,
} from './serialization.js';
import { StringType } from './string.js';
import { DateType } from './date.js';
import { RecordProps, RecordType } from './record.js';
import { NumberType } from './number.js';
import { BooleanType } from './boolean.js';
import { SetType } from './set.js';
import { ValueSchemaType } from './value.js';
import { QueryType } from './query.js';
import { CollectionNameFromModels } from '../db.js';

export type Operator =
  | '='
  | '<'
  | '>'
  | '<='
  | '>='
  | '!='
  | 'like'
  | 'nlike'
  | 'in'
  | 'nin'
  | 'has'
  | '!has';

export type Optional<T extends DataType> = T & { context: { optional: true } };

export type ValueType<TO extends UserTypeOptions> =
  | StringType<TO>
  | NumberType<TO>
  | BooleanType<TO>
  | DateType<TO>;
export type DataType =
  | ValueType<any>
  | SetType<ValueType<any>, any>
  | QueryType<any, any, any>
  | RecordType<RecordProps<any, any>>;

export const Nullable = <T extends ValueSchemaType>(type: T) =>
  Type.Union([type, Type.Null()]);

export function userTypeOptionsAreValid(options: UserTypeOptions) {
  return Value.Check(UserTypeOptionsSchema, options);
}

export const Timestamp = Type.Readonly(
  Type.Tuple([Type.Number(), Type.String()])
);
export type TimestampType = Static<typeof Timestamp>;

// NOTE: default values must be serializable
export function calcDefaultValue(options: UserTypeOptions) {
  let attributeDefault = options.default;
  if (attributeDefault === undefined) {
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
    }
  }
  return undefined;
}

export function typeFromJSON(
  serializedType: ValueAttributeDefinition | undefined,
  context?: Record<string, any>
): ValueType<any>;
export function typeFromJSON(
  serializedType: AttributeDefinition | undefined,
  context?: Record<string, any>
): DataType;
export function typeFromJSON(
  serializedType: AttributeDefinition | undefined,
  context: Record<string, any> = {}
): DataType {
  if (!serializedType)
    throw new TypeJSONParseError(
      'Failed to parse this schema definition from its serialized form because it is undefined.'
    );
  let baseType: DataType;
  switch (serializedType.type) {
    case 'string':
      baseType = StringType(serializedType.options);
      break;
    case 'number':
      baseType = NumberType(serializedType.options);
      break;
    case 'boolean':
      baseType = BooleanType(serializedType.options);
      break;
    case 'date':
      baseType = DateType(serializedType.options);
      break;
    case 'set':
      baseType = SetType(
        typeFromJSON(serializedType.items),
        serializedType.options
      );
      break;
    case 'query':
      baseType = QueryType(serializedType.query, serializedType.cardinality);
      break;
    case 'record':
      const optional = serializedType.optional || [];
      baseType = RecordType(
        Object.fromEntries(
          Object.entries(serializedType.properties).map(([key, val]) => [
            key,
            typeFromJSON(val as any, { optional: optional.includes(key) }),
          ])
        )
      );
      break;
    default:
      throw new UnrecognizedAttributeTypeError(
        (serializedType as AttributeDefinition).type
      );
  }

  // apply context
  for (const key in context) {
    baseType.context[key] = context[key];
  }
  return baseType;
}

import { BooleanType } from '../data-types/definitions/boolean.js';
import { DateType } from '../data-types/definitions/date.js';
import { NumberType } from '../data-types/definitions/number.js';
import { QueryType } from '../data-types/definitions/query.js';
import { RecordType } from '../data-types/definitions/record.js';
import { SetType } from '../data-types/definitions/set.js';
import { StringType } from '../data-types/definitions/string.js';
import { TypeInterface } from '../data-types/definitions/type.js';
import { ValueInterface } from '../data-types/definitions/value.js';
import {
  TypeJSONParseError,
  UnrecognizedAttributeTypeError,
} from '../errors.js';
import { AttributeDefinition } from '../schema/types/index.js';

/**
 * Deserializes a type definition from its serialized (JSON) form
 */
export function typeFromJSON(
  serializedType: AttributeDefinition | undefined,
  context: Record<string, any> = {}
): TypeInterface {
  if (!serializedType)
    throw new TypeJSONParseError(
      'Failed to parse this schema definition from its serialized form because it is undefined.'
    );
  let baseType: TypeInterface;
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
        typeFromJSON(serializedType.items) as ValueInterface,
        serializedType.options
      );
      break;
    case 'query':
      baseType = QueryType(serializedType.query, serializedType.cardinality);
      break;
    case 'record':
      let optional = serializedType.optional || [];
      // We dont handle empty arrays well, optional if empty comes back as empty object
      if (!Array.isArray(optional)) {
        optional = Object.keys(optional);
      }
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

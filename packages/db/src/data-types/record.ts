import { DBSerializationError } from '../errors.js';
import { DataType } from './base.js';
import { RecordAttributeDefinition } from './serialization.js';
import { ExtractJSType, ExtractDBType, TypeInterface } from './type.js';

export type RecordType<Properties extends { [k: string]: DataType }> =
  TypeInterface<
    'record',
    { [k in keyof Properties]: ExtractJSType<Properties[k]> },
    { [k in keyof Properties]: ExtractDBType<Properties[k]> },
    // { [k in keyof Properties]: ExtractTimestampedType<Properties[k]> },
    readonly []
  > & {
    properties: Properties;
  };

export function RecordType<Properties extends { [k: string]: DataType }>(
  properties: Properties
): RecordType<Properties> {
  return {
    type: 'record' as const,
    supportedOperations: [] as const, // 'hasKey', etc
    properties,
    toJSON(): RecordAttributeDefinition {
      const serializedProps = Object.fromEntries(
        Object.entries(properties).map(([key, val]) => [key, val.toJSON()])
      );
      return { type: this.type, properties: serializedProps };
    },
    convertInputToDBValue(val: any) {
      if (!this.validateInput(val))
        throw new DBSerializationError(`record`, val);
      return Object.fromEntries(
        Object.entries(properties).map(([k, propDef]) => [
          k,
          propDef.convertInputToDBValue(
            // @ts-expect-error
            val[k]
          ),
        ])
      ) as { [K in keyof Properties]: ExtractDBType<Properties[K]> };
    },
    // Type should go extract the db type of each of its keys
    default() {
      return Object.fromEntries(
        Object.entries(properties)
          .map(([key, val]) => [key, val.default()])
          .filter(([_, v]) => v !== undefined)
      );
    },
    validateInput(_val: any) {
      // cannot assign null
      if (_val === null) return false;
      // must be an object
      if (typeof _val !== 'object') return false;
      // must have all the properties
      if (Object.keys(_val).length !== Object.keys(properties).length)
        return false;
      for (const k in properties) {
        if (Object.prototype.hasOwnProperty.call(properties, k)) {
          const v = properties[k];
          if (!v.validateInput(_val[k])) return false;
        } else {
          return false;
        }
      }
      return true;
    },
    validateTripleValue(_val: any) {
      return true; // TODO
    },
    convertDBValueToJS(val) {
      const result: Partial<{
        [K in keyof Properties]: ExtractJSType<Properties[K]>;
      }> = {};
      for (const k in val) {
        if (Object.prototype.hasOwnProperty.call(val, k)) {
          const v = val[k];
          // This is mostly to catch when "_collection" is included in the entity
          result[k] = properties[k]
            ? properties[k].convertDBValueToJS(
                // @ts-ignore
                v
              )
            : k;
        }
      }
      return result as {
        [K in keyof Properties]: ExtractJSType<Properties[K]>;
      };
    },
  };
}

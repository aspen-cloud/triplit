import { DataType } from './base.js';
import { RecordAttributeDefinition } from './serialization.js';
import { ExtractJSType, ExtractSerializedType, TypeInterface } from './type.js';

export type RecordType<Properties extends { [k: string]: DataType }> =
  TypeInterface<
    'record',
    { [k in keyof Properties]: ExtractJSType<Properties[k]> },
    { [k in keyof Properties]: ExtractSerializedType<Properties[k]> },
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
    convertInputToJson(val: any) {
      return val;
    },
    // TODO: determine proper value and type here
    // Type should go extract the deserialized type of each of its keys
    default() {
      return Object.fromEntries(
        Object.entries(properties)
          .map(([key, val]) => [key, val.default()])
          .filter(([_, v]) => v !== undefined)
      );
    },
    validateInput(_val: any) {
      return true; // TODO
    },
    convertJsonValueToJS(val) {
      const result: Partial<{
        [K in keyof Properties]: ExtractJSType<Properties[K]>;
      }> = {};
      for (const k in val) {
        if (Object.prototype.hasOwnProperty.call(val, k)) {
          const v = val[k];
          // This is mostly to catch when "_collection" is included in the entity
          result[k] = properties[k]
            ? properties[k].convertJsonValueToJS(
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

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
      const invalidReason = this.validateInput(val);
      if (invalidReason)
        throw new DBSerializationError(
          `record`,
          JSON.stringify(val),
          invalidReason
        );
      return Object.fromEntries(
        Object.entries(properties)
          .filter(([_k, propDef]) => propDef.type !== 'query')
          .map(([k, propDef]) => [
            k,
            propDef.convertInputToDBValue(
              // @ts-expect-error
              val[k]
            ),
          ])
      ) as { [K in keyof Properties]: ExtractDBType<Properties[K]> };
    },
    convertDBValueToJS(val) {
      const result: Partial<{
        [K in keyof Properties]: ExtractJSType<Properties[K]>;
      }> = {};
      for (const k in val) {
        if (Object.prototype.hasOwnProperty.call(val, k)) {
          const v = val[k];
          if (!properties[k] || properties[k].type === 'query') {
            result[k] = v;
            continue;
          }
          // This is mostly to catch when "_collection" is included in the entity
          // @ts-expect-error
          result[k] = properties[k].convertDBValueToJS(
            // @ts-expect-error
            v
          );
        }
      }
      return result as {
        [K in keyof Properties]: ExtractJSType<Properties[K]>;
      };
    },
    convertJSONToJS(val) {
      if (typeof val !== 'object')
        throw new Error('Invalid JSON value for record');
      return Object.fromEntries(
        Object.entries(val).map(([k, v]) => {
          const propDef = properties[k];
          if (!propDef) throw new Error(`Invalid property ${k} for record`);
          return [k, propDef.convertJSONToJS(v)];
        })
      ) as { [K in keyof Properties]: ExtractJSType<Properties[K]> };
    },
    convertJSToJSON(val) {
      return Object.fromEntries(
        Object.entries(properties).map(([k, propDef]) => [
          k,
          propDef.convertJSToJSON(
            // @ts-expect-error
            val[k]
          ),
        ])
      );
    },
    // Type should go extract the db type of each of its keys
    defaultInput() {
      return Object.fromEntries(
        Object.entries(properties)
          .map(([key, val]) => [key, val.defaultInput()])
          .filter(([_, v]) => v !== undefined)
      );
    },
    validateInput(_val: any) {
      // cannot assign null
      if (_val === null) return 'value cannot be null';
      // must be an object
      if (typeof _val !== 'object') return 'value must be an object';

      // all required properties are present
      const requiredProperties = Object.entries(properties).filter(
        // Need to add query here to support schemas as records
        ([_k, v]) => v.type !== 'query' && v.defaultInput() === undefined
      );
      const keysSet = new Set(Object.keys(_val));
      const missingProperties = requiredProperties
        .filter(([k, _v]) => {
          return !keysSet.has(k);
        })
        .map(([k, _v]) => k);
      if (missingProperties.length > 0)
        return `missing properties: ${missingProperties.join(', ')}`;

      for (const k in _val) {
        if (properties[k]) {
          const v = properties[k];
          const reason = v.validateInput(_val[k]);
          if (reason) return `invalid value for ${k} (${reason})`;
        } else {
          return `invalid property ${k}`;
        }
      }
      return undefined;
    },
    validateTripleValue(_val: any) {
      return true; // TODO
    },
  };
}

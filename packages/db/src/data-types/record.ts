import {
  DBSerializationError,
  JSONValueParseError,
  TriplitError,
} from '../errors.js';
import { DataType, Optional } from './base.js';
import {
  AttributeDefinition,
  RecordAttributeDefinition,
} from './serialization.js';
import { ExtractJSType, ExtractDBType, TypeInterface } from './type.js';

type BooleanNot<T extends boolean> = T extends true ? false : true;
type IsPropertyOptional<T extends DataType> = T extends DataType
  ? T extends Optional<T>
    ? true
    : false
  : never;
type IsPropertyRequired<T extends DataType> = BooleanNot<IsPropertyOptional<T>>;

type RecordJSType<
  Properties extends { [k: string]: DataType | Optional<DataType> }
> = {
  [k in keyof Properties as IsPropertyRequired<Properties[k]> extends true
    ? k
    : never]: ExtractJSType<Properties[k]>;
} & {
  [k in keyof Properties as IsPropertyOptional<Properties[k]> extends true
    ? k
    : never]?: ExtractJSType<Properties[k]>;
};

export type RecordType<
  Properties extends { [k: string]: DataType | Optional<DataType> }
> = TypeInterface<
  'record',
  RecordJSType<Properties>,
  { [k in keyof Properties]: ExtractDBType<Properties[k]> },
  // { [k in keyof Properties]: ExtractTimestampedType<Properties[k]> },
  readonly []
> & {
  properties: Properties;
  optional?: (keyof Properties)[];
};

export function RecordType<
  Properties extends { [k: string]: DataType | Optional<DataType> }
>(properties: Properties): RecordType<Properties> {
  const optional = (
    Object.entries(properties)
      .filter(([_k, v]) => !!v.context.optional)
      .map(([k, _v]) => k) || []
  ).sort();

  function isOptional(key: string) {
    return optional.includes(key);
  }

  return {
    type: 'record' as const,
    supportedOperations: [] as const, // 'hasKey', etc
    context: {},
    properties,
    // Due to how we "hash" schemas we need to keep optional keys sorted
    // I think we're setup to do that where needed
    // A better approach might be a hash function per data type
    optional,
    toJSON(): RecordAttributeDefinition<Properties> {
      const serializedProps = Object.fromEntries(
        Object.entries(properties).map(([key, type]) => [key, type.toJSON()])
      ) as Record<keyof Properties, AttributeDefinition>;

      // We don't support empty arrays well during (de)serialization, so dont save them for now
      // Also fix that soon plz...
      const serialized = {
        type: this.type,
        properties: serializedProps,
      } as RecordAttributeDefinition<Properties>;
      if (optional.length > 0) serialized.optional = optional;

      return serialized;
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
          .filter(([k, propDef]) => {
            const isQuery = propDef.type === 'query';
            const optionalAndNoValue = isOptional(k) && val[k] === undefined;
            return !isQuery && !optionalAndNoValue;
          })
          .map(([k, propDef]) => {
            return [
              k,
              propDef.convertInputToDBValue(
                // @ts-expect-error
                val[k]
              ),
            ];
          })
      ) as { [K in keyof Properties]: ExtractDBType<Properties[K]> };
    },
    convertDBValueToJS(val, schema) {
      const result: Partial<RecordJSType<Properties>> = {};
      for (const k in val) {
        if (Object.prototype.hasOwnProperty.call(val, k)) {
          const v = val[k];
          // TODO this should be removed instead our entity reducer should return
          // null for undefined entities and we should handle that in the properties types
          if (v === undefined) continue;
          if (!properties[k]) {
            // @ts-expect-error
            result[k] = v;
            continue;
          }
          // This is mostly to catch when "_collection" is included in the entity
          // @ts-expect-error
          result[k] = properties[k].convertDBValueToJS(
            // @ts-expect-error
            v,
            schema
          );
        }
      }
      return result as RecordJSType<Properties>;
    },
    convertJSONToJS(val, schema) {
      if (typeof val !== 'object') throw new JSONValueParseError('record', val);
      return Object.fromEntries(
        Object.entries(val).map(([k, v]) => {
          const propDef = properties[k];
          if (!propDef)
            throw new TriplitError(`Invalid property ${k} for record`);
          return [k, propDef.convertJSONToJS(v, schema)];
        })
      ) as RecordJSType<Properties>;
    },
    convertJSToJSON(val, schema) {
      return Object.fromEntries(
        Object.entries(properties)
          .filter(
            ([k, _propDef]) =>
              !(
                isOptional(k) &&
                // @ts-expect-error

                val[k] === undefined
              )
          )
          .map(([k, propDef]) => {
            return [
              k,
              propDef.convertJSToJSON(
                // @ts-expect-error
                val[k],
                schema
              ),
            ];
          })
      );
    },
    // Type should go extract the db type of each of its keys
    defaultInput() {
      // Record defaults are kinda weird, think through this
      if (this.context.optional) return undefined;
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
        ([k, v]) =>
          !isOptional(k) && v.type !== 'query' && v.defaultInput() === undefined
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
          if (isOptional(k) && _val[k] === undefined) continue;
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

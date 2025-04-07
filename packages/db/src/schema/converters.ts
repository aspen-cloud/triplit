import { TriplitError } from '../errors.js';
import { DBSchema } from '../db.js';
import { RecordType, SetType, Type } from './data-types/index.js';

type EntityConverter = (entity: any) => any;
export type TypeConverters = Map<string, { fromDB: EntityConverter }>;

function recursivelyGetPropsToConvert(
  recordConfig: RecordType,
  prefix: string[] = [],
  dateList: string[][] = [],
  setList: [string[], 'string' | 'number' | 'boolean' | 'date'][] = []
) {
  for (const [prop, propConfig] of Object.entries(recordConfig.properties)) {
    if (propConfig.type === 'date') {
      dateList.push([...prefix, prop]);
    }
    if (propConfig.type === 'set') {
      setList.push([
        [...prefix, prop],
        (propConfig as SetType<any>).items.type,
      ]);
    }
    if (propConfig.type === 'record') {
      recursivelyGetPropsToConvert(
        propConfig as RecordType,
        [...prefix, prop],
        dateList,
        setList
      );
    }
  }
  return { datePaths: dateList, setPaths: setList };
}

export function getTypeConvertersFromSchema(
  schema?: DBSchema
): TypeConverters | undefined {
  if (!schema) return;
  const conversions: TypeConverters = new Map();
  for (const [collection, schemaConfig] of Object.entries(schema.collections)) {
    const { datePaths, setPaths } = recursivelyGetPropsToConvert(
      schemaConfig.schema
    );
    // This has the slight benefit that it will bail out if we dont have anything to convert, so incurs no overhead
    // Eventually this should be replaced by a compiled converter
    if (datePaths.length === 0 && setPaths.length === 0) {
      continue;
    }
    // TODO: probably want to prune / skip for undefined
    conversions.set(collection, {
      fromDB: (entity) => {
        return Type.decode(schemaConfig.schema, entity);
      },
    });
  }
  return conversions;
}

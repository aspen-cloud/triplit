import { TriplitError } from '../errors.js';
import { DBSchema } from '../db.js';
import { RecordType, SetType } from './data-types/index.js';

type EntityConverter = (entites: any[]) => any;
export type TypeConverters = Map<
  string,
  { toDB: EntityConverter; fromDB: EntityConverter }
>;

function convertToDate(val: string | null | undefined) {
  if (val === null) return null;
  if (val === undefined) return undefined;
  return new Date(val);
}

function convertFromDate(val: Date | null | undefined) {
  if (val === null) return null;
  if (val === undefined) return undefined;
  return new Date(val).toISOString();
}

const setConverters = {
  string: String,
  number: Number,
  boolean: Boolean,
  date: Date,
};

function convertToSet(val: any, setType: 'string' | 'number' | 'boolean') {
  if (val === null) return null;
  if (val === undefined) return undefined;
  const set = new Set();
  for (const item in val) {
    if (val[item] === true) set.add(setConverters[setType](item));
  }
  return set;
}

function convertToDateSet(val: any) {
  if (val === null) return null;
  if (val === undefined) return undefined;
  const set = new Set();
  for (const item in val) {
    if (val[item]) set.add(new Date(item));
  }
  return set;
}

function convertFromSet(
  val: Set<string | number | boolean> | null | undefined,
  setType: 'string' | 'number' | 'boolean'
): Record<string, boolean> | null | undefined {
  if (val === null) return null;
  if (val === undefined) return undefined;
  const obj: Record<string, boolean> = {};

  for (const item of val) {
    /**
     * TODO: add actual input validation
     * adding this here for test to pass
     */
    if (typeof item !== setType) {
      throw new TriplitError(
        `Invalid value ${item} for set<${setType}>. Expected ${setType}.`
      );
    }
    obj[String(item)] = true;
  }

  return obj;
}

function convertFromDateSet(
  val: Set<Date> | null | undefined
): Record<string, boolean> | null | undefined {
  if (val === null) return null;
  if (val === undefined) return undefined;
  const obj: Record<string, boolean> = {};
  for (const item of val) {
    obj[new Date(item).toISOString()] = true;
  }
  return obj;
}

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
    if (datePaths.length === 0 && setPaths.length === 0) {
      continue;
    }
    // TODO: probably want to prune / skip for undefined
    conversions.set(collection, {
      fromDB: (entity) => {
        let converted = entity;
        for (const datePath of datePaths) {
          converted = applyConversion(converted, datePath, convertToDate);
        }
        for (const [setPath, setType] of setPaths) {
          if (setType === 'date') {
            converted = applyConversion(converted, setPath, convertToDateSet);
          }
          converted = applyConversion(converted, setPath, (val) =>
            convertToSet(val, setType)
          );
        }
        return converted;
      },
      toDB: (entities) => {
        for (const datePath of datePaths) {
          applyConversion(entities, datePath, convertFromDate);
        }
        for (const [setPath, setType] of setPaths) {
          if (setType === 'date') {
            applyConversion(entities, setPath, convertFromDateSet);
          } else {
            applyConversion(entities, setPath, (val) =>
              convertFromSet(val, setType)
            );
          }
        }
      },
    });
  }
  return conversions;
}

/**
 * This will apply the conversion function to the given attribute path
 * iteratively without mutating the original entity and minimizing the
 * amount of copies made.
 * @param entity
 * @param attributePath
 * @param conversionFn
 */
function applyConversion<T extends any>(
  entity: T,
  attributePath: string[],
  conversionFn: (value: any) => any
): T {
  let currentEntity = entity;
  for (let i = 0; i < attributePath.length - 1; i++) {
    const key = attributePath[i];
    if (currentEntity[key] === undefined) {
      return entity;
    }
    currentEntity = currentEntity[key];
  }
  const lastKey = attributePath[attributePath.length - 1];
  if (currentEntity[lastKey] === undefined) {
    return entity;
  }
  const newValue = conversionFn(currentEntity[lastKey]);
  if (newValue === undefined) {
    return entity;
  }
  const newEntity = { ...entity };
  let currentNewEntity = newEntity;
  for (let i = 0; i < attributePath.length - 1; i++) {
    const key = attributePath[i];
    currentNewEntity[key] = { ...currentNewEntity[key] };
    currentNewEntity = currentNewEntity[key];
  }
  currentNewEntity[lastKey] = newValue;
  return newEntity;
}

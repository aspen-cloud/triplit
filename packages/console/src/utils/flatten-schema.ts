import { Collection, RecordType } from '@triplit/entity-db';

export function flattenSchema(collectionSchema: Collection): Collection {
  const schema = flattenRecord(collectionSchema.schema);
  const flattenedSchema = { ...collectionSchema, schema };
  return flattenedSchema;
}

export function flattenRecord(
  recordSchema: RecordType,
  prefix = ''
): RecordType {
  let properties = {} as RecordType['properties'];
  for (const key in recordSchema.properties) {
    const value = recordSchema.properties[key];
    if (value.type === 'record') {
      const { properties: nestedProps } = flattenRecord(
        value,
        prefix + key + '.'
      );
      properties = { ...properties, ...nestedProps };
    } else {
      properties[prefix + key] = value;
    }
  }
  return { properties, type: recordSchema.type };
}

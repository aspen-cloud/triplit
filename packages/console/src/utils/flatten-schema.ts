import { CollectionDefinition } from '@triplit/db';
import {
  AttributeDefinition,
  RecordAttributeDefinition,
} from '@triplit/db/src/data-types/serialization.js';

export function flattenSchema(
  collectionSchema: CollectionDefinition
): CollectionDefinition {
  //@ts-expect-error
  const schema = flattenRecord(collectionSchema.schema);
  const flattenedSchema = { ...collectionSchema, schema };
  // @ts-expect-error
  return flattenedSchema;
}

export function flattenRecord(
  recordSchema: RecordAttributeDefinition,
  prefix = ''
): RecordAttributeDefinition {
  let properties = {} as Record<string, AttributeDefinition>;
  let optional = recordSchema.optional?.map((opt) => prefix + opt) ?? [];
  (
    Object.entries(recordSchema.properties) as [string, AttributeDefinition][]
  ).forEach(([key, value]) => {
    if (value.type === 'record') {
      const { properties: nestedProps, optional: nestOptional } = flattenRecord(
        value,
        prefix + key + '.'
      );
      properties = { ...properties, ...nestedProps };
      optional = [...optional, ...(nestOptional as string[])];
    } else {
      properties[prefix + key] = value;
    }
  });
  // @ts-expect-error
  return { properties, optional, type: recordSchema.type };
}

import { Static, Type } from '@sinclair/typebox';
import { CollectionRules } from '../db';

export const ValueSchemaTypes = [
  'string',
  'number',
  'boolean',
  'date',
] as const;
type ValueSerializedSchemaType = (typeof ValueSchemaTypes)[number];

export type ValueAttributeDefinition = {
  type: ValueSerializedSchemaType;
  options?: UserTypeOptions;
};
export type RecordAttributeDefinition = {
  type: 'record';
  properties: Record<string, AttributeDefinition>;
};
export type CollectionAttributeDefinition = {
  type: 'set'; // only sets are defined for now, but 'list' would go here
  of: ValueAttributeDefinition;
};

export type AttributeDefinition =
  | ValueAttributeDefinition
  | RecordAttributeDefinition
  | CollectionAttributeDefinition;

export interface CollectionDefinition {
  attributes: {
    [path: string]: AttributeDefinition;
  };
  rules?: CollectionRules<any>;
}

export interface CollectionsDefinition {
  [collection: string]: CollectionDefinition;
}

export type SchemaDefinition = {
  version: number;
  collections: CollectionsDefinition;
};

export type UserTypeOptions = Static<typeof UserTypeOptionsSchema>;

const DefaultFunctionSchema = Type.Object({
  func: Type.String(),
  args: Type.Optional(Type.Union([Type.Array(Type.Any()), Type.Null()])),
});

export type DefaultFunctionType = Static<typeof DefaultFunctionSchema>;

export const UserTypeOptionsSchema = Type.Object({
  nullable: Type.Optional(Type.Boolean()),
  default: Type.Optional(
    Type.Union([
      Type.String(),
      Type.Number(),
      Type.Boolean(),
      Type.Null(),
      DefaultFunctionSchema,
    ])
  ),
});

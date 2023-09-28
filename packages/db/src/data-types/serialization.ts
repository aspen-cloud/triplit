import { Static, Type } from '@sinclair/typebox';
import { CollectionRules } from '../db';

export const VALUE_TYPE_KEYS = ['string', 'number', 'boolean', 'date'] as const;
export type ValueTypeKeys = (typeof VALUE_TYPE_KEYS)[number];

export const COLLECTION_TYPE_KEYS = ['set'] as const;
export type CollectionTypeKeys = (typeof COLLECTION_TYPE_KEYS)[number];

// TODO: add record type
export const ALL_TYPES = [...VALUE_TYPE_KEYS, ...COLLECTION_TYPE_KEYS] as const;

export type ValueAttributeDefinition = {
  type: ValueTypeKeys;
  options: UserTypeOptions;
};
export type RecordAttributeDefinition = {
  type: 'record';
  properties: Record<string, AttributeDefinition>;
};
export type CollectionAttributeDefinition = {
  type: CollectionTypeKeys;
  items: ValueAttributeDefinition;
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

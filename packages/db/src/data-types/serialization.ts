import { Static, Type } from '@sinclair/typebox';
import { CollectionRules } from '../db.js';
import { SubQuery } from './query.js';

export const VALUE_TYPE_KEYS = ['string', 'number', 'boolean', 'date'] as const;
export type ValueTypeKeys = (typeof VALUE_TYPE_KEYS)[number];

export const COLLECTION_TYPE_KEYS = ['set'] as const;
export type CollectionTypeKeys = (typeof COLLECTION_TYPE_KEYS)[number];

export const RECORD_TYPE_KEYS = ['record'] as const;
export type RecordTypeKeys = (typeof RECORD_TYPE_KEYS)[number];

// TODO: add record type
export const ALL_TYPES = [
  ...VALUE_TYPE_KEYS,
  ...COLLECTION_TYPE_KEYS,
  ...RECORD_TYPE_KEYS,
] as const;
export type AllTypes = (typeof ALL_TYPES)[number];

export type ValueAttributeDefinition = {
  type: ValueTypeKeys;
  options: UserTypeOptions;
};
export type RecordAttributeDefinition<
  Properties extends Record<string, AttributeDefinition> = {}
> = {
  type: RecordTypeKeys;
  properties: Properties;
};
export type CollectionAttributeDefinition = {
  type: CollectionTypeKeys;
  items: ValueAttributeDefinition;
};
export type QueryAttributeDefinition = {
  type: 'query';
  query: SubQuery<any, any>;
};

export type AttributeDefinition =
  | ValueAttributeDefinition
  | RecordAttributeDefinition
  | CollectionAttributeDefinition
  | QueryAttributeDefinition;

export interface CollectionDefinition {
  schema: RecordAttributeDefinition<{
    id: { type: 'string'; options: { nullable: false } };
  }>;
  rules?: CollectionRules<any>;
}

export interface CollectionsDefinition {
  [collection: string]: CollectionDefinition;
}

export type SchemaDefinition = {
  version: number;
  collections: CollectionsDefinition;
};

// Could be nice to get a generic to determine the expected value of default
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

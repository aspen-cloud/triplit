import { UserTypeOptions } from '../../data-types/types/index.js';
import {
  AttributeDefinition,
  CollectionPermissions,
  CollectionRules,
  Rule,
} from '../../schema/types/index.js';

export type CreateCollectionPayload = {
  name: string;
  schema: { [path: string]: AttributeDefinition };
  rules?: CollectionRules<any, any>;
  permissions?: CollectionPermissions<any, any>;
  optional?: string[];
};

export type DropCollectionPayload = { name: string };
export type AddAttributePayload = {
  collection: string;
  path: string[];
  attribute: AttributeDefinition;
  optional?: boolean;
};
export type DropAttributePayload = { collection: string; path: string[] };
export type AlterAttributeOptionPayload = {
  collection: string;
  path: string[];
  options: UserTypeOptions;
};
export type DropAttributeOptionPayload = {
  collection: string;
  path: string[];
  option: string;
};
export type AddRulePayload = {
  collection: string;
  scope: string;
  id: string;
  rule: Rule<any, any>;
};
export type DropRulePayload = { collection: string; scope: string; id: string };
export type SetAttributeOptionalPayload = {
  collection: string;
  path: string[];
  optional: boolean;
};

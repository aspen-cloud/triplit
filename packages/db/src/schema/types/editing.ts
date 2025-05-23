import { DBSchema } from '../../db.js';
import { DataType, TypeConfig } from './index.js';

export type ChangeToAttribute =
  | {
      type: 'update';
      changes: {
        config?: TypeConfig;
        items?: { type: string };
        type?: string;
      };
    }
  | {
      type: 'insert';
      dataType: DataType;
      isNewCollection: boolean;
    }
  | {
      type: 'delete';
      dataType: DataType;
    };

export type AttributeDiff = {
  attribute: string[];
} & ChangeToAttribute;

export type CollectionAttributeDiff = {
  _diff: 'collectionAttribute';
  collection: string;
} & AttributeDiff;

export type CollectionRelationshipsDiff = {
  _diff: 'collectionRelationships';
  collection: string;
};

export type CollectionPermissionsDiff = {
  _diff: 'collectionPermissions';
  collection: string;
};

export type RolesDiff = {
  _diff: 'roles';
};

export type Diff =
  | CollectionAttributeDiff
  | CollectionRelationshipsDiff
  | CollectionPermissionsDiff
  | RolesDiff;

export type ALLOWABLE_DATA_CONSTRAINTS =
  | 'none'
  | 'never'
  | 'collection_is_empty'
  | 'attribute_is_empty' // undefined
  | 'attribute_has_no_undefined'
  | 'attribute_has_no_null'
  | 'attribute_satisfies_enum';

export type BackwardsIncompatibleEdit = {
  issue: string;
  dataConstraint: ALLOWABLE_DATA_CONSTRAINTS;
  context: CollectionAttributeDiff;
  attributeCure: (
    collection: string,
    attribute: string[],
    enums?: string[]
  ) => string | null;
};

export type PossibleDataViolation = {
  violatesExistingData: boolean;
  cure: string;
} & BackwardsIncompatibleEdit;

type SchemaChangeBase = {
  message: string;
  diff: Diff[];
  issues: PossibleDataViolation[];
  oldSchema: DBSchema | undefined;
  newSchema: DBSchema;
};
export type SuccessfulSchemaChange = SchemaChangeBase & {
  successful: true;
  code: 'SUCCESS';
};
export type FailedSchemaChange = SchemaChangeBase & {
  successful: false;
  code:
    | 'SCHEMA_INVALID'
    | 'SCHEMA_COMPATIBILITY_MISMATCH'
    | 'EXISTING_DATA_MISMATCH'
    | 'ERROR';
};
export type SchemaChange = SuccessfulSchemaChange | FailedSchemaChange;

export type ChangeToAttribute =
  | {
      type: 'update';
      changes: {
        items?: { type: string };
        type?: string;
        options?: any;
        optional?: boolean;
      };
    }
  | {
      type: 'insert';
      metadata: {
        type: string;
        options: any;
        optional: boolean;
      };
      isNewCollection: boolean;
    }
  | {
      type: 'delete';
      metadata: {
        type: string;
        options: any;
        optional: boolean;
      };
    };

export type AttributeDiff = {
  attribute: string[];
} & ChangeToAttribute;

export type CollectionAttributeDiff = {
  _diff: 'collectionAttribute';
  collection: string;
} & AttributeDiff;

export type CollectionRulesDiff = {
  _diff: 'collectionRules';
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
  | CollectionRulesDiff
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

import { Model, Models, StoreSchema } from './types/index.js';
import { Value as TBValue, ValuePointer, Diff } from '@sinclair/typebox/value';
import { UserTypeOptions } from '../data-types/types/index.js';
import { DBTransaction } from '../db-transaction.js';

type ChangeToAttribute =
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

type AttributeDiff = {
  attribute: string[];
} & ChangeToAttribute;

type CollectionAttributeDiff = {
  _diff: 'collectionAttribute';
  collection: string;
} & AttributeDiff;

type CollectionRulesDiff = {
  _diff: 'collectionRules';
  collection: string;
};

type CollectionPermissionsDiff = {
  _diff: 'collectionPermissions';
  collection: string;
};

type RolesDiff = {
  _diff: 'roles';
};

type Diff =
  | CollectionAttributeDiff
  | CollectionRulesDiff
  | CollectionPermissionsDiff
  | RolesDiff;

// type AttributeDiff = AttributeChange;

function isCollectionAttributeDiff(
  diff: Diff
): diff is CollectionAttributeDiff {
  return diff._diff === 'collectionAttribute';
}

function diffCollectionSchemas(
  modelA: Model | undefined,
  modelB: Model | undefined,
  attributePathPrefix: string[] = []
): AttributeDiff[] {
  if (modelA === undefined && modelB === undefined) return [];
  // TODO: properly type these
  const propertiesA: any = modelA?.properties ?? {};
  const propertiesB: any = modelB?.properties ?? {};
  const allProperties = new Set([
    ...Object.keys(propertiesA),
    ...Object.keys(propertiesB),
  ]);
  const diff: AttributeDiff[] = [];

  for (const prop of allProperties) {
    if (!(prop in propertiesA)) {
      // Added in modelB
      const path = [...attributePathPrefix, prop];
      diff.push({
        type: 'insert',
        attribute: path,
        metadata: {
          type: propertiesB[prop].type,
          options: propertiesB[prop].options,
          optional: modelB?.optional?.includes(prop) ?? false,
        },
        isNewCollection: modelA === undefined,
      });
      continue;
    }
    if (!(prop in propertiesB)) {
      // Deleted in modelB
      const path = [...attributePathPrefix, prop];
      diff.push({
        type: 'delete',
        attribute: path,
        metadata: {
          type: propertiesA[prop].type,
          options: propertiesA[prop].options,
          optional: modelA?.optional?.includes(prop) ?? false,
        },
      });
      continue;
    }
    if (prop in propertiesA && prop in propertiesB) {
      if (
        TBValue.Equal(propertiesA[prop].toJSON(), propertiesB[prop].toJSON()) &&
        (modelA?.optional?.includes(prop) ?? false) ===
          (modelB?.optional?.includes(prop) ?? false)
      )
        continue;
      const path = [...attributePathPrefix, prop];

      if (
        propertiesA[prop].type === 'record' &&
        propertiesB[prop].type === 'record'
      ) {
        // console.log('diffing record', propertiesA[prop], propertiesB[prop]);
        diff.push(
          ...diffCollectionSchemas(propertiesA[prop], propertiesB[prop], path)
        );
        continue;
      }
      const attrDiff: AttributeDiff = {
        type: 'update',
        attribute: path,
        // TODO: show matt this
        changes: { options: {} },
      };

      // Check if type has changed
      if (propertiesA[prop].type !== propertiesB[prop].type) {
        attrDiff.changes.type = propertiesB[prop].type;
      }

      // Check if Set item type has changed
      if (propertiesA[prop].type === 'set') {
        // console.log(propertiesA[prop], propertiesB[prop]);
        if (propertiesA[prop].items.type !== propertiesB[prop].items.type) {
          attrDiff.changes.items = {
            type: propertiesB[prop].items.type,
          };
        }
      }

      // Check if optionality has changed
      const isOptionalInA = modelA?.optional?.includes(prop) ?? false;
      const isOptionalInB = modelB?.optional?.includes(prop) ?? false;
      if (isOptionalInA !== isOptionalInB) {
        attrDiff.changes.optional = isOptionalInB;
      }

      // Check if type options has changed
      attrDiff.changes.options = diffAttributeOptions(
        propertiesA[prop].options ?? {},
        propertiesB[prop].options ?? {}
      );
      diff.push(attrDiff);
      continue;
    }
  }
  return diff;
}

function diffAttributeOptions(
  attr1: UserTypeOptions & { enum?: string[] },
  attr2: UserTypeOptions & { enum?: string[] }
) {
  const diff: any = {};
  if (attr1.nullable !== attr2.nullable) {
    // TODO: determine how strict we want to be here about false vs. undefined
    diff.nullable = !!attr2.nullable;
  }
  if (attr1.default !== attr2.default) {
    diff.default = attr2.default;
  }
  const changedFromAnyToAnEnum = attr2.enum && !attr1.enum;
  const removedAnEnumOption =
    attr1.enum &&
    attr2.enum &&
    !attr1.enum?.every((val) => attr2.enum?.includes(val));
  if (changedFromAnyToAnEnum || removedAnEnumOption) {
    diff.enum = attr2.enum;
  }
  return diff;
}

export function diffSchemas(
  schemaA: StoreSchema<Models>,
  schemaB: StoreSchema<Models>
): Diff[] {
  const allCollections = new Set([
    ...Object.keys(schemaA.collections),
    ...Object.keys(schemaB.collections),
  ]);
  const diff: Diff[] = [];
  for (const collection of allCollections) {
    const collectionA = schemaA.collections[collection];
    const collectionB = schemaB.collections[collection];
    // Diff schemas
    diff.push(
      ...diffCollectionSchemas(
        collectionA?.schema,
        collectionB?.schema
      ).map<CollectionAttributeDiff>((change) => ({
        _diff: 'collectionAttribute',
        collection,
        ...change,
      }))
    );
    // Diff rules
    const isRuleDiff = Diff(collectionA?.rules, collectionB?.rules).length > 0;
    if (isRuleDiff)
      diff.push({
        _diff: 'collectionRules',
        collection,
      });
    // Diff permissions
    const isPermissionDiff =
      Diff(collectionA?.permissions, collectionB?.permissions).length > 0;
    if (isPermissionDiff)
      diff.push({
        _diff: 'collectionPermissions',
        collection,
      });
  }

  // Diff roles
  const isRoleDiff = Diff(schemaA.roles, schemaB.roles).length > 0;
  if (isRoleDiff)
    diff.push({
      _diff: 'roles',
    });

  return diff;
}

type ALLOWABLE_DATA_CONSTRAINTS =
  | 'never'
  | 'collection_is_empty'
  | 'attribute_is_empty' // undefined
  | 'attribute_has_no_undefined'
  | 'attribute_has_no_null'
  | 'attribute_satisfies_enum';

type BackwardsIncompatibleEdits = {
  issue: string;
  allowedIf: ALLOWABLE_DATA_CONSTRAINTS;
  context: CollectionAttributeDiff;
  attributeCure: (
    collection: string,
    attribute: string[],
    enums?: string[]
  ) => string | null;
};

export function getBackwardsIncompatibleEdits(schemaDiff: Diff[]) {
  return schemaDiff.reduce((acc, curr) => {
    if (!isCollectionAttributeDiff(curr)) return acc;
    const maybeDangerousEdit = DANGEROUS_EDITS.find((check) =>
      check.matchesDiff(curr)
    );
    if (maybeDangerousEdit) {
      acc.push({
        issue: maybeDangerousEdit.description,
        allowedIf: maybeDangerousEdit.allowedIf,
        context: curr,
        attributeCure: maybeDangerousEdit.attributeCure,
      });
    }
    return acc;
  }, [] as BackwardsIncompatibleEdits[]);
}

const DANGEROUS_EDITS = [
  {
    description: 'removed an optional attribute',
    matchesDiff: (diff: CollectionAttributeDiff) => {
      return diff.type === 'delete' && diff.metadata.optional === true;
    },
    allowedIf: 'attribute_is_empty',
    attributeCure: () => null,
  },
  {
    description: 'removed a non-optional attribute',
    matchesDiff: (diff: CollectionAttributeDiff) => {
      return diff.type === 'delete';
    },
    allowedIf: 'collection_is_empty',
    attributeCure: (_collection, attribute) =>
      `make '${attribute.join('.')}' optional`,
  },
  {
    description: 'changed a attribute from optional to required',
    matchesDiff: (diff: CollectionAttributeDiff) => {
      if (diff.type === 'update') {
        return diff.changes.optional === false;
      }
      return false;
    },
    allowedIf: 'attribute_has_no_undefined',
    attributeCure: () => null,
  },
  {
    description: 'changed the type of an attribute',
    matchesDiff: (diff: CollectionAttributeDiff) => {
      if (diff.type === 'update') {
        return diff.changes.type !== undefined;
      }
      return false;
    },
    allowedIf: 'attribute_is_empty',
    attributeCure: (_collection, attribute) =>
      `revert the change to '${attribute.join(
        '.'
      )}' and create a different, optional, attribute with the new type`,
  },
  {
    description: "changed the type of a set's items",
    matchesDiff: (diff: CollectionAttributeDiff) => {
      if (diff.type === 'update') {
        return diff.changes.items !== undefined;
      }
      return false;
    },
    allowedIf: 'attribute_is_empty',
    attributeCure: (_collection, attribute) =>
      `revert the change to '${attribute.join(
        '.'
      )}' and create a different, optional, attribute with the new type`,
  },
  {
    description: 'added an attribute where optional is not set',
    matchesDiff: (diff: CollectionAttributeDiff) => {
      if (
        diff.type === 'insert' &&
        !diff.isNewCollection &&
        diff.metadata.optional === false &&
        diff.metadata.type !== 'query'
      )
        return true;
      return false;
    },
    allowedIf: 'collection_is_empty',
    attributeCure: (_collection, attribute) =>
      `make '${attribute.join('.')}' optional`,
  },
  {
    description: 'changed an attribute from nullable to non-nullable',
    matchesDiff: (diff: CollectionAttributeDiff) => {
      if (diff.type === 'update') {
        return diff.changes.options?.nullable === false;
      }
      return false;
    },
    allowedIf: 'attribute_has_no_null',
    attributeCure: () => null,
  },
  {
    description:
      'added an enum to an attribute or removed an option from an existing enum',
    matchesDiff: (diff: CollectionAttributeDiff) => {
      if (diff.type === 'update') {
        return diff.changes.options.enum !== undefined;
      }
      return false;
    },
    allowedIf: 'attribute_satisfies_enum',
    attributeCure: (_collection, attribute, enumArray) =>
      `revert the change to '${attribute.join(
        '.'
      )}' and create a different, optional, attribute with the new enum OR ensure all values of '${attribute.join(
        '.'
      )} are in the new enum: ${enumArray}`,
  },
] satisfies {
  allowedIf: ALLOWABLE_DATA_CONSTRAINTS;
  description: string;
  matchesDiff: (diff: CollectionAttributeDiff) => boolean;
  attributeCure: (
    collection: string,
    attribute: string[],
    enumArray?: string[]
  ) => string | null;
}[];

async function isEditSafeWithExistingData(
  tx: DBTransaction<any>,
  attributeDiff: CollectionAttributeDiff,
  allowedIf: ALLOWABLE_DATA_CONSTRAINTS
) {
  return await DATA_CONSTRAINT_CHECKS[allowedIf](
    tx,
    attributeDiff.collection,
    attributeDiff.attribute,
    attributeDiff?.type === 'update'
      ? attributeDiff.changes.options.enum
      : undefined
  );
}

export type PossibleDataViolations = {
  violatesExistingData: boolean;
  cure: string;
} & BackwardsIncompatibleEdits;

export async function getSchemaDiffIssues(
  tx: DBTransaction<any>,
  schemaDiff: Diff[]
) {
  const backwardsIncompatibleEdits = getBackwardsIncompatibleEdits(schemaDiff);
  const results = await Promise.all(
    backwardsIncompatibleEdits.map(async (edit) => {
      const violatesExistingData = !(await isEditSafeWithExistingData(
        tx,
        edit.context,
        edit.allowedIf
      ));
      const dataCure = DATA_CHANGE_CURES[edit.allowedIf](
        edit.context.collection,
        edit.context.attribute
      );
      const attributeCure = edit.attributeCure(
        edit.context.collection,
        edit.context.attribute
      );
      return {
        ...edit,
        violatesExistingData,
        cure: attributeCure ? attributeCure + ' or ' + dataCure : dataCure,
      };
    })
  );
  return results as PossibleDataViolations[];
}

const DATA_CONSTRAINT_CHECKS: Record<
  ALLOWABLE_DATA_CONSTRAINTS,
  (
    tx: DBTransaction<any>,
    collection: string,
    attribute: string[],
    enumArray: string[]
  ) => Promise<boolean>
> = {
  never: async () => false,
  collection_is_empty: detectCollectionIsEmpty,
  attribute_is_empty: detectAttributeIsEmpty,
  attribute_has_no_undefined: detectAttributeHasNoUndefined,
  attribute_has_no_null: detectAttributeHasNoNull,
  attribute_satisfies_enum: detectAttributeSatisfiesEnum,
};

const DATA_CHANGE_CURES: Record<
  ALLOWABLE_DATA_CONSTRAINTS,
  (collection: string, attribute: string[]) => string
> = {
  never: () => 'This edit is never allowed',
  collection_is_empty: (collection) =>
    `delete all entities in '${collection}' to allow this edit`,
  attribute_is_empty: (_collection, attribute) =>
    `set all values of '${attribute.join(
      '.'
    )}' to undefined to allow this edit`,
  attribute_has_no_undefined: (_collection, attribute) =>
    `ensure all values of '${attribute.join(
      '.'
    )}' are not undefined to allow this edit`,
  attribute_has_no_null: (_collection, attribute) =>
    `ensure all values of '${attribute.join(
      '.'
    )}' are not null to allow this edit`,
  attribute_satisfies_enum: (_collection, attribute) =>
    `ensure all values of '${attribute.join(
      '.'
    )}' are in the enum to allow this edit`,
};

async function detectAttributeSatisfiesEnum(
  tx: DBTransaction<any>,
  collectionName: string,
  attribute: string[],
  enumArray: string[]
) {
  const allEntities = await tx.fetch(
    tx.db
      .query(collectionName)
      .select([attribute.join('.')])
      .where(attribute.join('.'), 'nin', enumArray)
      .build(),
    { skipRules: true }
  );
  return allEntities.length === 0;
}

async function detectAttributeHasNoUndefined(
  tx: DBTransaction<any>,
  collectionName: string,
  attribute: string[]
) {
  const allEntities = await tx.fetch(
    tx.db
      .query(collectionName)
      .select([attribute.join('.')])
      .build(),
    { skipRules: true }
  );
  return !Array.from(allEntities.values()).some(
    (entity) =>
      ValuePointer.Get(entity, '/' + attribute.join('/')) === undefined
  );
}

async function detectAttributeIsEmpty(
  tx: DBTransaction<any>,
  collectionName: string,
  attribute: string[]
) {
  const allEntities = await tx.fetch(
    tx.db
      .query(collectionName)
      .select([attribute.join('.')])
      .build(),
    { skipRules: true }
  );
  return Array.from(allEntities.values()).every((entity) => {
    return ValuePointer.Get(entity, '/' + attribute.join('/')) === undefined;
  });
}

async function detectAttributeHasNoNull(
  tx: DBTransaction<any>,
  collectionName: string,
  attribute: string[]
) {
  const allEntities = await tx.fetch(
    tx.db
      .query(collectionName)
      .select([attribute.join('.')])
      .where(attribute.join('.'), '=', null)
      .limit(1)
      .build(),
    { skipRules: true }
  );
  return allEntities.length === 0;
}

async function detectCollectionIsEmpty(
  tx: DBTransaction<any>,
  collectionName: string
) {
  const allEntities = await tx.fetch(
    tx.db.query(collectionName).select([]).limit(1).build(),
    { skipRules: true }
  );
  return allEntities.length === 0;
}

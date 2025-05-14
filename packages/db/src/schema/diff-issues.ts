import {
  ALLOWABLE_DATA_CONSTRAINTS,
  AttributeDiff,
  BackwardsIncompatibleEdit,
  CollectionAttributeDiff,
  DataType,
  Diff,
  Models,
  PossibleDataViolation,
  Relationship,
  Relationships,
  SchemaChange,
  TypeConfig,
} from './types/index.js';
import { Logger } from '@triplit/logger';
import { DBSchema } from '../db.js';
import { Type } from './index.js';
import { permissionsEqual, rolesEqual } from '../permissions.js';
import { RecordProps, RecordType } from './data-types/index.js';
import { hashQuery } from '../query/hash-query.js';

function isCollectionAttributeDiff(
  diff: Diff
): diff is CollectionAttributeDiff {
  return diff._diff === 'collectionAttribute';
}

function diffCollectionSchemas(
  modelA: RecordType<RecordProps<string, DataType>> | undefined,
  modelB: RecordType<RecordProps<string, DataType>> | undefined,
  attributePathPrefix: string[] = []
): AttributeDiff[] {
  if (modelA === undefined && modelB === undefined) return [];
  const propertiesA = modelA?.properties ?? {};
  const propertiesB = modelB?.properties ?? {};
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
        dataType: propertiesB[prop],
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
        dataType: propertiesA[prop],
      });
      continue;
    }
    if (prop in propertiesA && prop in propertiesB) {
      if (Type.equal(propertiesA[prop], propertiesB[prop])) continue;
      const path = [...attributePathPrefix, prop];
      if (
        propertiesA[prop].type === 'record' &&
        propertiesB[prop].type === 'record'
      ) {
        diff.push(
          ...diffCollectionSchemas(propertiesA[prop], propertiesB[prop], path)
        );
        continue;
      }
      const attrDiff: AttributeDiff = {
        type: 'update',
        attribute: path,
        changes: { config: {} },
      };

      // Check if type has changed
      if (propertiesA[prop].type !== propertiesB[prop].type) {
        attrDiff.changes.type = propertiesB[prop].type;
      }

      // Check if Set item type has changed
      if (
        propertiesA[prop].type === 'set' &&
        propertiesB[prop].type === 'set'
      ) {
        if (propertiesA[prop].items.type !== propertiesB[prop].items.type) {
          attrDiff.changes.items = {
            type: propertiesB[prop].items.type,
          };
        }
      }

      // // Check if optionality has changed
      // const isOptionalInA = propertiesA[prop].config.optional ?? false;
      // const isOptionalInB = propertiesA[prop].config.optional ?? false;
      // if (isOptionalInA !== isOptionalInB) {
      //   attrDiff.changes.config.optional = isOptionalInB;
      // }

      // Check if type options has changed
      attrDiff.changes.config = diffAttributeOptions(
        propertiesA[prop].config ?? {},
        propertiesB[prop].config ?? {}
      );
      diff.push(attrDiff);
      continue;
    }
  }
  return diff;
}

// TODO confirm this diffing is still correct
function diffAttributeOptions<Options extends TypeConfig>(
  attr1: Options,
  attr2: Options
) {
  const diff: any = {};
  if (attr1.nullable !== attr2.nullable) {
    // TODO: determine how strict we want to be here about false vs. undefined
    diff.nullable = !!attr2.nullable;
  }
  if (attr1.optional !== attr2.optional) {
    diff.optional = !!attr2.optional;
  }
  if (attr1.default !== attr2.default) {
    diff.default = attr2.default;
  }
  const changedFromAnyToAnEnum = attr2.enum && !attr1.enum;
  const removedAnEnumOption =
    attr1.enum &&
    attr2.enum &&
    !attr1.enum?.every((val: any) => attr2.enum?.includes(val));
  if (changedFromAnyToAnEnum || removedAnEnumOption) {
    diff.enum = attr2.enum;
  }
  return diff;
}

export function diffSchemas(
  schemaA: DBSchema<Models>,
  schemaB: DBSchema<Models>
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

    // TODO: Diff relationships
    const isRelationDiff = !relationshipsEqual(
      collectionA?.relationships,
      collectionB?.relationships
    );
    if (isRelationDiff)
      diff.push({
        _diff: 'collectionRelationships',
        collection,
      });

    // Diff permissions
    const isPermissionDiff = !permissionsEqual(
      collectionA?.permissions,
      collectionB?.permissions
    );

    if (isPermissionDiff)
      diff.push({
        _diff: 'collectionPermissions',
        collection,
      });
  }

  // Diff roles
  const isRoleDiff = !rolesEqual(schemaA.roles, schemaB.roles);
  if (isRoleDiff)
    diff.push({
      _diff: 'roles',
    });

  return diff;
}

function relationshipsEqual(
  a: Relationships | undefined,
  b: Relationships | undefined
) {
  if (!a && !b) return true;
  if (!a || !b) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    const relationshipA = a[key];
    const relationshipB = b[key];
    if (!relationshipEqual(relationshipA, relationshipB)) return false;
  }
  return true;
}

function relationshipEqual(
  a: Relationship | undefined,
  b: Relationship | undefined
) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.cardinality !== b.cardinality) return false;
  // TODO: implement a better hashQuery for unprepared queries
  if (hashQuery(a.query) !== hashQuery(b.query)) return false;
  return true;
}

// function areDifferent(a: any, b: any): boolean {
//   // Both undefined, no diff
//   if (!a && !b) return false;
//   // One is undefined, diff
//   if (!a || !b) return true;
//   // Diff requires both to be objects
//   return TBValue.Diff(a, b).length > 0;
// }

export function getBackwardsIncompatibleEdits(schemaDiff: Diff[]) {
  return schemaDiff.reduce((acc, curr) => {
    if (!isCollectionAttributeDiff(curr)) return acc;
    const maybeDangerousEdit = DANGEROUS_EDITS.find((check) =>
      check.matchesDiff(curr)
    );
    if (maybeDangerousEdit) {
      acc.push({
        issue: maybeDangerousEdit.description,
        dataConstraint: maybeDangerousEdit.dataConstraint,
        context: curr,
        attributeCure: maybeDangerousEdit.attributeCure,
      });
    }
    return acc;
  }, [] as BackwardsIncompatibleEdit[]);
}

const DANGEROUS_EDITS = [
  {
    description: 'removed an optional attribute',
    matchesDiff: (diff: CollectionAttributeDiff) => {
      return diff.type === 'delete' && Type.isOptional(diff.dataType);
    },
    dataConstraint: 'attribute_is_empty',
    attributeCure: () => null,
  },
  // TODO:
  // {
  //   description: 'removed an relational attribute',
  //   matchesDiff: (diff: CollectionAttributeDiff) => {
  //     return diff.type === 'delete' && diff.metadata.type === 'query';
  //   },
  //   dataConstraint: 'none',
  //   attributeCure: () => null,
  // },
  {
    description: 'removed a required attribute',
    matchesDiff: (diff: CollectionAttributeDiff) => {
      return diff.type === 'delete';
    },
    dataConstraint: 'collection_is_empty',
    attributeCure: (_collection, attribute) =>
      `make '${attribute.join('.')}' optional`,
  },
  {
    description: 'changed a attribute from optional to required',
    matchesDiff: (diff: CollectionAttributeDiff) => {
      if (diff.type === 'update') {
        return diff.changes.config?.optional === false;
      }
      return false;
    },
    dataConstraint: 'attribute_has_no_undefined',
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
    dataConstraint: 'attribute_is_empty',
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
    dataConstraint: 'attribute_is_empty',
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
        !Type.isOptional(diff.dataType)
      )
        return true;
      return false;
    },
    dataConstraint: 'collection_is_empty',
    attributeCure: (_collection, attribute) =>
      `make '${attribute.join('.')}' optional`,
  },
  {
    description: 'changed an attribute from nullable to non-nullable',
    matchesDiff: (diff: CollectionAttributeDiff) => {
      if (diff.type === 'update') {
        return diff.changes.config?.nullable === false;
      }
      return false;
    },
    dataConstraint: 'attribute_has_no_null',
    attributeCure: () => null,
  },
  {
    description:
      'added an enum to an attribute or removed an option from an existing enum',
    matchesDiff: (diff: CollectionAttributeDiff) => {
      if (diff.type === 'update') {
        return diff.changes.config?.enum !== undefined;
      }
      return false;
    },
    dataConstraint: 'attribute_satisfies_enum',
    attributeCure: (_collection, attribute, enumArray) =>
      `revert the change to '${attribute.join(
        '.'
      )}' and create a different, optional, attribute with the new enum OR ensure all values of '${attribute.join(
        '.'
      )} are in the new enum: ${enumArray}`,
  },
] satisfies {
  dataConstraint: ALLOWABLE_DATA_CONSTRAINTS;
  description: string;
  matchesDiff: (diff: CollectionAttributeDiff) => boolean;
  attributeCure: (
    collection: string,
    attribute: string[],
    enumArray?: string[]
  ) => string | null;
}[];

type FetchHandler = (query: any) => Promise<any[]>;

async function isEditSafeWithExistingData(
  fetchHandler: FetchHandler,
  attributeDiff: CollectionAttributeDiff,
  allowedIf: ALLOWABLE_DATA_CONSTRAINTS
) {
  return await DATA_CONSTRAINT_CHECKS[allowedIf](
    fetchHandler,
    attributeDiff.collection,
    attributeDiff.attribute,
    attributeDiff?.type === 'update'
      ? attributeDiff.changes.config?.enum
      : undefined
  );
}

export async function getSchemaDiffIssues(
  fetchHandler: FetchHandler,
  schemaDiff: Diff[]
) {
  const backwardsIncompatibleEdits = getBackwardsIncompatibleEdits(schemaDiff);
  // TODO: check promise.all reliability
  const results = await Promise.all(
    backwardsIncompatibleEdits.map(async (edit) => {
      const violatesExistingData = !(await isEditSafeWithExistingData(
        fetchHandler,
        edit.context,
        edit.dataConstraint
      ));
      const dataCure =
        edit.dataConstraint &&
        DATA_CHANGE_CURES[edit.dataConstraint](
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
        cure:
          attributeCure && dataCure
            ? attributeCure + ' or ' + dataCure
            : dataCure,
      };
    })
  );
  return results as PossibleDataViolation[];
}

const DATA_CONSTRAINT_CHECKS: Record<
  ALLOWABLE_DATA_CONSTRAINTS,
  (
    fetchHandler: FetchHandler,
    collection: string,
    attribute: string[],
    enumArray: string[]
  ) => Promise<boolean>
> = {
  never: async () => false,
  none: async () => true,
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
  none: () =>
    'This edit does not violate any data constraints but can cause existing queries that reference this attribute to fail',
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
  fetchHandler: FetchHandler,
  collectionName: string,
  attribute: string[],
  enumArray: string[]
) {
  const allEntities = await fetchHandler({
    collectionName,
    select: ['id'],
    limit: 1,
    where: [[attribute.join('.'), 'nin', enumArray]],
  });
  return allEntities.length === 0;
}

async function detectAttributeHasNoUndefined(
  fetchHandler: FetchHandler,
  collectionName: string,
  attribute: string[]
) {
  const allEntities = await fetchHandler({
    collectionName,
    select: ['id'],
    limit: 1,
    where: [[attribute.join('.'), 'isDefined', false]],
  });
  return allEntities.length === 0;
}

async function detectAttributeIsEmpty(
  fetchHandler: FetchHandler,
  collectionName: string,
  attribute: string[]
) {
  const allEntities = await fetchHandler({
    collectionName,
    select: ['id'],
    limit: 1,
    where: [[attribute.join('.'), 'isDefined', true]],
  });
  return allEntities.length === 0;
}

async function detectAttributeHasNoNull(
  fetchHandler: FetchHandler,
  collectionName: string,
  attribute: string[]
) {
  const allEntities = await fetchHandler({
    collectionName,
    select: ['id'],
    limit: 1,
    where: [[attribute.join('.'), '=', null]],
  });
  return allEntities.length === 0;
}

async function detectCollectionIsEmpty(
  fetchHandler: FetchHandler,
  collectionName: string
) {
  const allEntities = await fetchHandler(
    { collectionName, select: ['id'], limit: 1 }
    // { skipRules: true }
  );
  return allEntities.length === 0;
}

export function logSchemaChangeViolations(
  change: SchemaChange,
  {
    logger,
    forcePrintIssues = false,
  }: { logger?: Logger; forcePrintIssues?: boolean } = {}
) {
  const log = logger ?? (console as unknown as Logger);
  if (change.successful) {
    log.info('Schema update successful');
  } else {
    log.error('Schema update failed. Please resolve the following issues:');
  }
  if (change.invalid) {
    log.error(change.invalid);
    return;
  }

  const compatibleIssuesMessage = `Found ${change.issues.length} backwards incompatible schema changes.`;
  if (change.issues.length > 0) {
    log.warn(compatibleIssuesMessage);
  } else {
    log.info(compatibleIssuesMessage);
  }

  if (!change.successful || forcePrintIssues) {
    const problematicIssues = change.issues.filter(
      (issue) => forcePrintIssues || issue.violatesExistingData
    );
    logSchemaIssues(log, problematicIssues);
  }
}

function logSchemaIssues(logger: Logger, issues: PossibleDataViolation[]) {
  const collectionIssueMap = issues.reduce((acc, issue) => {
    const collection = issue.context.collection;
    const existingIssues = acc.get(collection) ?? [];
    acc.set(collection, [...existingIssues, issue]);
    return acc;
  }, new Map<string, PossibleDataViolation[]>());
  collectionIssueMap.forEach((issues, collection) => {
    logger.error(`\nCollection: '${collection}'`);
    issues.forEach(({ issue, context, cure }) => {
      logger.error(
        `\t'${context.attribute.join('.')}'
\t\tIssue: ${issue}
\t\tFix:   ${cure}`
      );
    });
  });
  logger.info('');
}

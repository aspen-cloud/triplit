import {
  AddAttributePayload,
  AddRulePayload,
  AlterAttributeOptionPayload,
  CollectionDefinition,
  CollectionsDefinition,
  CreateCollectionPayload,
  DropAttributeOptionPayload,
  DropAttributePayload,
  DropCollectionPayload,
  DropRulePayload,
  SetAttributeOptionalPayload,
} from '@triplit/db';
import { diff } from 'jsondiffpatch';

type CreateCollectionOperation = ['create_collection', CreateCollectionPayload];
type DropCollectionOperation = ['drop_collection', DropCollectionPayload];
type AddAttributeOperation = ['add_attribute', AddAttributePayload];
type DropAttributeOperation = ['drop_attribute', DropAttributePayload];
type AlterAttributeOptionOperation = [
  'alter_attribute_option',
  AlterAttributeOptionPayload,
];
type DropAttributeOptionOperation = [
  'drop_attribute_option',
  DropAttributeOptionPayload,
];
type AddRuleOperation = ['add_rule', AddRulePayload];
type DropRuleOperation = ['drop_rule', DropRulePayload];
type SetAttributeOptionalOperation = [
  'set_attribute_optional',
  SetAttributeOptionalPayload,
];

type DBOperation =
  | CreateCollectionOperation
  | DropCollectionOperation
  | AddAttributeOperation
  | DropAttributeOperation
  | AlterAttributeOptionOperation
  | DropAttributeOptionOperation
  | AddRuleOperation
  | DropRuleOperation
  | SetAttributeOptionalOperation;

type SchemaChangeset = {
  up: DBOperation[];
  down: DBOperation[];
};

type ChangesetContext = {
  previousSchema: CollectionsDefinition;
  targetScema: CollectionsDefinition;
};

export function createSchemaChangeset(
  schemaLeft: CollectionsDefinition,
  schemaRight: CollectionsDefinition
) {
  const schemaDiff = diff(schemaLeft, schemaRight);
  if (!schemaDiff) return undefined;
  const changeset: SchemaChangeset = { up: [], down: [] };
  const context = { previousSchema: schemaLeft, targetScema: schemaRight };
  parseCollectionDiff(changeset, schemaDiff, context);
  // Dont love this check, but sometimes we have diffs that are basically no ops and shouldnt create changesets
  if (changeset.up.length === 0 && changeset.down.length === 0)
    return undefined;
  return changeset;
}

function parseCollectionDiff(
  changeset: SchemaChangeset,
  diff: any,
  context: ChangesetContext
) {
  const collectionKeys = Object.keys(diff);
  for (const collectionKey of collectionKeys) {
    const collectionDiff = diff[collectionKey];
    const collectionDiffStatus = diffStatus(collectionDiff);
    if (collectionDiffStatus === 'ADDED') {
      const collectionDefinition = collectionDiff[0];
      const createCollectionOperation = genCreateCollectionOperation(
        collectionKey,
        collectionDefinition
      );
      const dropCollectionOperation = genDropCollectionOperation({
        name: collectionKey,
      });
      changeset.up.push(createCollectionOperation);
      changeset.down.unshift(dropCollectionOperation);
    } else if (collectionDiffStatus === 'REMOVED') {
      const dropCollectionOperation = genDropCollectionOperation({
        name: collectionKey,
      });
      const collectionDefinition = collectionDiff[0];
      const createCollectionOperation = genCreateCollectionOperation(
        collectionKey,
        collectionDefinition
      );
      changeset.up.push(dropCollectionOperation);
      changeset.down.unshift(createCollectionOperation);
    } else if (collectionDiffStatus === 'CHANGED') {
      throw new Error('NOT HANDLED. FAILED TO PARSE.');
    } else {
      if (collectionDiff.schema?.properties) {
        parseAttributesDiff(
          changeset,
          collectionKey,
          collectionDiff.schema.properties,
          context
        );
      }
      if (collectionDiff.schema?.optional) {
        parseOptionalPropsDiff(
          changeset,
          collectionKey,
          collectionDiff.schema.optional,
          context
        );
      }
      if (collectionDiff.rules) {
        parseRulesDiff(changeset, collectionKey, collectionDiff.rules, context);
      }
    }
  }
}

function parseAttributesDiff(
  changeset: SchemaChangeset,
  collection: string,
  diff: any,
  context: ChangesetContext,
  attributePrefix: string[] = []
) {
  // We are not expecting the attributes property to be added or removed
  if (Array.isArray(diff)) throw new Error('Invalid diff: diff at attributes');
  for (const attributeKey of Object.keys(diff)) {
    const attributeDiff = diff[attributeKey];
    const attributeDiffStatus = diffStatus(attributeDiff);
    if (attributeDiffStatus === 'ADDED') {
      const attributeDefinition = attributeDiff[0];
      const addAttributeOperation = genAddAttributeOperation({
        collection,
        path: [...attributePrefix, attributeKey],
        attribute: attributeDefinition,
      });
      const dropAttributeOperation = genDropAttributeOperation({
        collection,
        path: [...attributePrefix, attributeKey],
      });
      changeset.up.push(addAttributeOperation);
      changeset.down.unshift(dropAttributeOperation);
    } else if (attributeDiffStatus === 'REMOVED') {
      const dropAttributeOperation = genDropAttributeOperation({
        collection,
        path: [...attributePrefix, attributeKey],
      });
      const attributeDefinition = attributeDiff[0];
      const addAttributeOperation = genAddAttributeOperation({
        collection,
        path: [...attributePrefix, attributeKey],
        attribute: attributeDefinition,
      });
      changeset.up.push(dropAttributeOperation);
      changeset.down.unshift(addAttributeOperation);
    } else if (attributeDiffStatus === 'CHANGED') {
      throw new Error('NOT HANDLED. FAILED TO PARSE.');
    } else {
      if (!!attributeDiff.type) {
        throw new Error(
          `Invalid diff: changing an attribute type is not supported. Received diff:\n\n${JSON.stringify(
            attributeDiff,
            null,
            2
          )}`
        );
      }
      // properties implies its a record type...might be nicer to actually read info from the schema
      if (!!attributeDiff.properties) {
        parseAttributesDiff(
          changeset,
          collection,
          attributeDiff.properties,
          context,
          [...attributePrefix, attributeKey]
        );
      }
      // Also implies its a record type
      if (!!attributeDiff.optional) {
        parseOptionalPropsDiff(
          changeset,
          collection,
          attributeDiff.optional,
          context,
          [...attributePrefix, attributeKey]
        );
      }
      // options implies its a leaf type
      if (!!attributeDiff.options) {
        parseAttributeOptionsDiff(
          changeset,
          collection,
          [...attributePrefix, attributeKey],
          attributeDiff.options
        );
      }
      // subquery change, drop and add
      if (!!attributeDiff.query || !!attributeDiff.cardinality) {
        const oldDefinition = getAttributeDefinitionFromPath(
          context.previousSchema[collection].schema,
          [...attributePrefix, attributeKey]
        );
        const newDefinition = getAttributeDefinitionFromPath(
          context.targetScema[collection].schema,
          [...attributePrefix, attributeKey]
        );
        const dropOldAttributeOperation = genDropAttributeOperation({
          collection,
          path: [...attributePrefix, attributeKey],
        });
        const addNewAttributeOperation = genAddAttributeOperation({
          collection,
          path: [...attributePrefix, attributeKey],
          attribute: newDefinition,
        });
        const dropNewAttributeOperation = genDropAttributeOperation({
          collection,
          path: [...attributePrefix, attributeKey],
        });
        const addOldAttributeOperation = genAddAttributeOperation({
          collection,
          path: [...attributePrefix, attributeKey],
          attribute: oldDefinition,
        });
        changeset.up.push(dropOldAttributeOperation, addNewAttributeOperation);
        changeset.down.unshift(
          dropNewAttributeOperation,
          addOldAttributeOperation
        );
      }

      // TODO: figure out what to do with "unknown" diff properties
      // throw new Error(
      //   `Invalid diff: received an unrecognized attribute definition diff\n\n${JSON.stringify(
      //     attributeDiff,
      //     null,
      //     2
      //   )}`
      // );
    }
  }
}

// We could pool all these together
function parseAttributeOptionsDiff(
  changeset: SchemaChangeset,
  collection: string,
  attribute: string[],
  diff: any
) {
  for (const optionKey of Object.keys(diff)) {
    const optionDiff = diff[optionKey];
    const optionDiffStatus = diffStatus(optionDiff);
    if (optionDiffStatus === 'ADDED') {
      const newValue = optionDiff[0];
      const newOptionOperation = genAlterAttributeOptionOperation({
        collection,
        path: attribute,
        options: { [optionKey]: newValue },
      });
      const oldOptionOperation = genDropAttributeOptionOperation({
        collection,
        path: attribute,
        option: optionKey,
      });
      changeset.up.push(newOptionOperation);
      changeset.down.unshift(oldOptionOperation);
    } else if (optionDiffStatus === 'REMOVED') {
      const oldValue = optionDiff[0];
      const newOptionOperation = genDropAttributeOptionOperation({
        collection,
        path: attribute,
        option: optionKey,
      });
      const oldOptionOperation = genAlterAttributeOptionOperation({
        collection,
        path: attribute,
        options: { [optionKey]: oldValue },
      });
      changeset.up.push(newOptionOperation);
      changeset.down.unshift(oldOptionOperation);
    } else if (optionDiffStatus === 'CHANGED') {
      const [oldValue, newValue] = optionDiff as [any, any];
      const newOptionOperation = genAlterAttributeOptionOperation({
        collection,
        path: attribute,
        options: { [optionKey]: newValue },
      });
      const oldOptionOperation = genAlterAttributeOptionOperation({
        collection,
        path: attribute,
        options: { [optionKey]: oldValue },
      });
      changeset.up.push(newOptionOperation);
      changeset.down.unshift(oldOptionOperation);
    } else {
      throw new Error('Failed to create changeset: Unexpected diff');
    }
  }
}

function parseOptionalPropsDiff(
  changeset: SchemaChangeset,
  collection: string,
  diff: any,
  context: ChangesetContext,
  attributePrefix: string[] = []
) {
  const optionalDiffStatus = diffStatus(diff);
  if (optionalDiffStatus === 'ADDED') {
    const optionalDefinition = diff[0];
    for (const optionalKey of optionalDefinition) {
      const attrPath = [...attributePrefix, optionalKey];
      const setOptionalOp = genSetAttributeOptionalOperation({
        collection,
        path: attrPath,
        optional: true,
      });
      const setNotOptionalOp = genSetAttributeOptionalOperation({
        collection,
        path: attrPath,
        optional: false,
      });
      changeset.up.push(setOptionalOp);
      changeset.down.unshift(setNotOptionalOp);
    }
  }
  if (optionalDiffStatus === 'REMOVED') {
    const optionalDefinition = diff[0];
    for (const optionalKey of optionalDefinition) {
      const attrPath = [...attributePrefix, optionalKey];
      const setNotOptionalOp = genSetAttributeOptionalOperation({
        collection,
        path: attrPath,
        optional: false,
      });
      const setOptionalOp = genSetAttributeOptionalOperation({
        collection,
        path: attrPath,
        optional: true,
      });
      changeset.up.push(setNotOptionalOp);
      changeset.down.unshift(setOptionalOp);
    }
  }
  if (optionalDiffStatus === 'CHANGED') {
    throw new Error('Failed to create changeset: Unexpected diff');
  }
  if (optionalDiffStatus === 'UNCHANGED') {
    if (diff._t !== 'a')
      throw new Error('Failed to create changeset: Unexpected diff'); // Not array
    const oldOptional = context.previousSchema[collection].schema.optional;
    const newOptional = context.targetScema[collection].schema.optional;
    const { added, removed } = calculateArrayChanges(oldOptional, newOptional);
    for (const optionalKey of added) {
      const attrPath = [...attributePrefix, optionalKey];
      const setOptionalOp = genSetAttributeOptionalOperation({
        collection,
        path: attrPath,
        optional: true,
      });
      const setNotOptionalOp = genSetAttributeOptionalOperation({
        collection,
        path: attrPath,
        optional: false,
      });
      changeset.up.push(setOptionalOp);
      changeset.down.unshift(setNotOptionalOp);
    }
    for (const optionalKey of removed) {
      const attrPath = [...attributePrefix, optionalKey];
      const setNotOptionalOp = genSetAttributeOptionalOperation({
        collection,
        path: attrPath,
        optional: false,
      });
      const setOptionalOp = genSetAttributeOptionalOperation({
        collection,
        path: attrPath,
        optional: true,
      });
      changeset.up.push(setNotOptionalOp);
      changeset.down.unshift(setOptionalOp);
    }
  }
}

function calculateArrayChanges(
  oldArray: any[],
  newArray: any[]
): { added: any[]; removed: any[] } {
  const added = newArray.filter((item) => !oldArray.includes(item));
  const removed = oldArray.filter((item) => !newArray.includes(item));
  return { added, removed };
}

function parseRulesDiff(
  changeset: SchemaChangeset,
  collection: string,
  diff: any,
  context: ChangesetContext
) {
  const rulesDiffStatus = diffStatus(diff);
  if (rulesDiffStatus === 'ADDED') {
    const rulesDefinition = diff[0];
    for (const ruleType of Object.keys(rulesDefinition)) {
      parseRulesTypeDiff(
        changeset,
        collection,
        ruleType,
        [rulesDefinition[ruleType]],
        context
      );
    }
  } else if (rulesDiffStatus === 'REMOVED') {
    const rulesDefinition = diff[0];
    for (const ruleType of Object.keys(rulesDefinition)) {
      parseRulesTypeDiff(
        changeset,
        collection,
        ruleType,
        [rulesDefinition[ruleType], 0, 0],
        context
      );
    }
  } else if (rulesDiffStatus === 'CHANGED') {
    throw new Error('NOT IMPLEMENTED');
  } else if (rulesDiffStatus === 'UNCHANGED') {
    for (const ruleType of Object.keys(diff)) {
      parseRulesTypeDiff(
        changeset,
        collection,
        ruleType,
        diff[ruleType],
        context
      );
    }
  }
  // throw new Error('NOT IMPLEMENTED');
}

function parseRulesTypeDiff(
  changeset: SchemaChangeset,
  collection: string,
  ruleType: string,
  diff: any,
  context: ChangesetContext
) {
  const rulesTypeDiffStatus = diffStatus(diff);
  if (rulesTypeDiffStatus === 'ADDED') {
    const rulesTypeDefinition = diff[0];
    for (const ruleKey of Object.keys(rulesTypeDefinition)) {
      parseRuleDiff(
        changeset,
        collection,
        ruleType,
        ruleKey,
        [rulesTypeDefinition[ruleKey]],
        context
      );
    }
  } else if (rulesTypeDiffStatus === 'REMOVED') {
    const rulesTypeDefinition = diff[0];
    for (const ruleKey of Object.keys(rulesTypeDefinition)) {
      parseRuleDiff(
        changeset,
        collection,
        ruleType,
        ruleKey,
        [rulesTypeDefinition[ruleKey], 0, 0],
        context
      );
    }
  } else if (rulesTypeDiffStatus === 'CHANGED') {
    throw new Error('NOT IMPLEMENTED');
  } else if (rulesTypeDiffStatus === 'UNCHANGED') {
    for (const ruleKey of Object.keys(diff)) {
      parseRuleDiff(
        changeset,
        collection,
        ruleType,
        ruleKey,
        diff[ruleKey],
        context
      );
    }
  }
}

function parseRuleDiff(
  changeset: SchemaChangeset,
  collection: string,
  ruleType: string,
  ruleKey: string,
  diff: any,
  context: ChangesetContext
) {
  const ruleDiffStatus = diffStatus(diff);
  if (ruleDiffStatus === 'ADDED') {
    const rule = diff[0];
    const addRuleOperation = genAddRuleOperation({
      collection,
      scope: ruleType,
      id: ruleKey,
      rule,
    });
    const dropRuleOperation = genDropRuleOperation({
      collection,
      scope: ruleType,
      id: ruleKey,
    });
    changeset.up.push(addRuleOperation);
    changeset.down.unshift(dropRuleOperation);
  } else if (ruleDiffStatus === 'REMOVED') {
    const rule = diff[0];
    const dropRuleOperation = genDropRuleOperation({
      collection,
      scope: ruleType,
      id: ruleKey,
    });
    const addRuleOperation = genAddRuleOperation({
      collection,
      scope: ruleType,
      id: ruleKey,
      rule,
    });
    changeset.up.push(dropRuleOperation);
    changeset.down.unshift(addRuleOperation);
  } else if (ruleDiffStatus === 'CHANGED') {
    throw new Error('NOT IMPLEMENTED');
  } else if (ruleDiffStatus === 'UNCHANGED') {
    // json diffing library is too specific with diff, but if we get here a property on the rule has changed
    const oldRule =
      context.previousSchema[collection].rules?.[ruleType][ruleKey];
    const newRule = context.targetScema[collection].rules?.[ruleType][ruleKey];
    // Throwing an error because its unexpected, but I havent really tested if it could happen (I think deleting/adding rules is handled elsewhere)
    if (!oldRule || !newRule) {
      throw new Error('Failed to create changeset: Unexpected diff');
    }
    const dropOldRuleOperation = genDropRuleOperation({
      collection,
      scope: ruleType,
      id: ruleKey,
    });
    const addNewRuleOperation = genAddRuleOperation({
      collection,
      scope: ruleType,
      id: ruleKey,
      rule: newRule,
    });

    const dropNewRuleOperation = genDropRuleOperation({
      collection,
      scope: ruleType,
      id: ruleKey,
    });
    const addOldRuleOperation = genAddRuleOperation({
      collection,
      scope: ruleType,
      id: ruleKey,
      rule: oldRule,
    });

    changeset.up.push(dropOldRuleOperation, addNewRuleOperation);
    changeset.down.unshift(dropNewRuleOperation, addOldRuleOperation);
  }
}

function genCreateCollectionOperation(
  name: string,
  collectionDefinition: CollectionDefinition
): CreateCollectionOperation {
  const attributes = collectionDefinition.schema.properties;
  const optional = collectionDefinition.schema.optional;
  return [
    'create_collection',
    {
      name,
      ...collectionDefinition,
      schema: attributes,
      optional,
    },
  ];
}

function genDropCollectionOperation(
  params: DropCollectionOperation[1]
): DropCollectionOperation {
  return ['drop_collection', params];
}

function genAddAttributeOperation(
  params: AddAttributeOperation[1]
): AddAttributeOperation {
  return ['add_attribute', params];
}

function genDropAttributeOperation(
  params: DropAttributeOperation[1]
): DropAttributeOperation {
  return ['drop_attribute', params];
}

function genAlterAttributeOptionOperation(
  params: AlterAttributeOptionOperation[1]
): AlterAttributeOptionOperation {
  // TODO: validate options
  return ['alter_attribute_option', params];
}

function genDropAttributeOptionOperation(
  params: DropAttributeOptionOperation[1]
): DropAttributeOptionOperation {
  // TODO: validate options
  return ['drop_attribute_option', params];
}

function genAddRuleOperation(params: AddRuleOperation[1]): AddRuleOperation {
  // TODO: validate options
  return ['add_rule', params];
}

function genDropRuleOperation(params: DropRuleOperation[1]): DropRuleOperation {
  // TODO: validate options
  return ['drop_rule', params];
}

function genSetAttributeOptionalOperation(
  params: SetAttributeOptionalOperation[1]
): SetAttributeOptionalOperation {
  return ['set_attribute_optional', params];
}

function diffStatus(diff: any) {
  if (!Array.isArray(diff)) return 'UNCHANGED';
  if (diff.length === 1) return 'ADDED';
  if (diff.length === 2) return 'CHANGED';
  if (diff.length === 3) return 'REMOVED';
  throw new Error('Invalid diff');
}

function getAttributeDefinitionFromPath(
  schema: CollectionDefinition['schema'],
  path: string[]
): any {
  return path.reduce((acc, key, i) => {
    if (acc.type === 'record') {
      return acc.properties[key];
    }
    throw new Error('Invalid path');
  }, schema);
}

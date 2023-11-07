import fs from 'node:fs';
import DB, {
  Migration,
  CollectionDefinition,
  CreateCollectionOperation,
  DropCollectionOperation,
  AddAttributeOperation,
  DropAttributeOperation,
  AlterAttributeOptionOperation,
  DropAttributeOptionOperation,
  AddRuleOperation,
  DropRuleOperation,
  CollectionsDefinition,
  hashSchemaJSON,
  schemaToJSON,
} from '@triplit/db';
import { diff } from 'jsondiffpatch';
import { getMigrationsDir } from './filesystem.js';
import { readLocalSchema } from './schema.js';

export interface MigrationFile {
  filename: string;
  migration: Migration;
}

export function readMigrations() {
  const migrationsDir = getMigrationsDir();
  return fs.readdirSync(migrationsDir).map<MigrationFile>((file) => ({
    migration: JSON.parse(
      fs.readFileSync(`${migrationsDir}/${file}`, 'utf8')
    ) as Migration,
    filename: file,
  }));
}

type MigrationsStatus =
  | 'IN_SYNC'
  | 'SERVER_BEHIND'
  | 'SERVER_AHEAD'
  | 'SERVER_UNTRACKED_CHANGES'
  | 'PROJECT_UNTRACKED_CHANGES'
  | 'PROJECT_HAS_ORPHANS'
  | 'UNKNOWN';

type ProjectMigrationStatus = 'IN_SYNC' | 'UNAPPLIED' | 'ORPHANED' | 'UNKNOWN';
type ServerMigrationStatus = 'IN_SYNC' | 'UNTRACKED' | 'UNKNOWN';

export async function getMigrationsStatus({ ctx }): Promise<{
  status: MigrationsStatus;
  server: {
    migrationIds: number[];
    migrationHash: number | undefined;
    schemaHash: number | undefined;
    schema: CollectionsDefinition | undefined;
    migrations: { id: number; parent: number; name: string }[];
    statuses: Record<number, ServerMigrationStatus>;
  };
  project: {
    migrationIds: number[];
    migrationsHash: number | undefined;
    schemaHash: number | undefined;
    schema: CollectionsDefinition | undefined;
    migrations: Migration[];
    statuses: Record<number, ProjectMigrationStatus>;
  };
}> {
  const serverMigrationInfo = await ctx.requestServer(
    'GET',
    '/migration/status'
  );

  const { schemaHash: serverHash, schema: serverSchemaJSON } =
    serverMigrationInfo;
  const serverMigrations: [{ id: number; parent: number; name: string }] =
    serverMigrationInfo.migrations ?? [];

  const projectMigrations = readMigrations()
    .map((mf) => mf.migration)
    .sort((a, b) => a.version - b.version);
  // const latestProjectMigrationId = projectMigrations.reduce((max, m) => {
  //   return Math.max(max ?? 0, m.version);
  // }, 0);

  const projectMigrationIds = projectMigrations?.map((m) => m.version) ?? [];
  const serverMigrationIds = serverMigrations?.map((m) => m.id) ?? [];
  const latestServerMigrationId = serverMigrationIds.at(-1) ?? 0;

  // DB of migrations up to what is known on the server
  // TODO: Think through if this is correct if other migrations slip in
  const serverMigrationsDB = new DB<any>({
    migrations: projectMigrations.filter((m) =>
      serverMigrationIds.includes(m.version)
    ),
  });
  await serverMigrationsDB.ensureMigrated;
  const serverMigrationsSchema = await serverMigrationsDB.getSchema();
  const serverMigrationsSchemaJSON = schemaToJSON(serverMigrationsSchema);
  const serverMigrationsHash = hashSchemaJSON(
    serverMigrationsSchemaJSON?.collections
  );

  // DB of all migrations in the project
  const projectMigrationsDB = new DB<any>({
    migrations: projectMigrations,
  });
  await projectMigrationsDB.ensureMigrated;
  const projectMigrationsSchema = await projectMigrationsDB.getSchema();
  const projectMigrationsSchemaJSON = schemaToJSON(projectMigrationsSchema);
  const projectMigrationsHash = hashSchemaJSON(
    projectMigrationsSchemaJSON?.collections
  );

  // Info from local schema file
  const projectFileSchema = await readLocalSchema();
  const projectFileSchemaJSON = projectFileSchema
    ? schemaToJSON({
        collections: projectFileSchema,
        version: 0,
      })
    : undefined;
  const projectFileHash = hashSchemaJSON(projectFileSchemaJSON?.collections); // more acurately 'schemaHash'?

  const projectMigrationStatuses: Record<number, ProjectMigrationStatus> = {};
  const serverMigrationStatuses: Record<number, ServerMigrationStatus> = {};

  function isOrphan(migration: { version: number; parent: number }) {
    // If directly ahead of server, not an orphan
    if (migration.parent === latestServerMigrationId) {
      return false;
    }
    // If a different server migration has this parent, we are an orphan
    if (
      serverMigrations.some(
        (sm) => sm.parent === migration.parent && sm.id !== migration.version
      )
    ) {
      return true;
    }

    // If we cannot find parent, we are an orphan
    const parentMigration = projectMigrations.find(
      (m) => m.version === migration.parent
    );
    if (!parentMigration) return true;
    return isOrphan(parentMigration);
  }

  function getProjectMigrationStatus(migration: {
    version: number;
    parent: number;
  }): ProjectMigrationStatus {
    if (projectMigrationIds.includes(migration.version)) {
      if (serverMigrationIds.includes(migration.version)) return 'IN_SYNC';
      // check if orphan
      if (isOrphan(migration)) return 'ORPHANED';
      return 'UNAPPLIED';
    }
    return 'UNKNOWN';
  }

  function getServerMigrationStatus(migration: {
    id: number;
    parent: number;
  }): ServerMigrationStatus {
    if (serverMigrationIds.includes(migration.id)) {
      if (projectMigrationIds.includes(migration.id)) {
        return 'IN_SYNC';
      }
      return 'UNTRACKED';
    }
    return 'UNKNOWN';
  }

  for (const m of projectMigrations) {
    projectMigrationStatuses[m.version] = getProjectMigrationStatus(m);
  }

  for (const m of serverMigrations) {
    serverMigrationStatuses[m.id] = getServerMigrationStatus(m);
  }

  const info = {
    server: {
      migrationIds: serverMigrationIds,
      migrationHash: serverMigrationsHash,
      schemaHash: serverHash,
      schema: serverSchemaJSON?.collections,
      migrations: serverMigrations,
      statuses: serverMigrationStatuses,
    },
    project: {
      migrationIds: projectMigrationIds,
      migrationsHash: projectMigrationsHash,
      schemaHash: projectFileHash,
      schema: projectFileSchemaJSON?.collections,
      migrations: projectMigrations,
      statuses: projectMigrationStatuses,
    },
  };

  // Any unknowns, we dont know the status and should not proceed
  if (
    Object.values(serverMigrationStatuses).some(
      (status) => status === 'UNKNOWN'
    ) ||
    Object.values(projectMigrationStatuses).some(
      (status) => status === 'UNKNOWN'
    )
  ) {
    return { status: 'UNKNOWN', ...info };
  }

  // If any server migrations are untracked, we should pull those in first
  if (
    Object.values(serverMigrationStatuses).some(
      (status) => status === 'UNTRACKED'
    )
  ) {
    return { status: 'SERVER_AHEAD', ...info };
  }

  // Next we should check if the server has changes to its schema that havent been tracked
  if (serverMigrationsHash !== serverHash) {
    return { status: 'SERVER_UNTRACKED_CHANGES', ...info };
  }

  // Next we should check for orphaned changes and warn the user to fix them (usually result of pulling in new migrations)
  if (
    Object.values(projectMigrationStatuses).some(
      (status) => status === 'ORPHANED'
    )
  ) {
    return { status: 'PROJECT_HAS_ORPHANS', ...info };
  }

  // check if we need to generate a migration (ie we have locally updated the schema)
  if (projectHasUntrackedChanges(projectFileHash, projectMigrationsHash)) {
    return { status: 'PROJECT_UNTRACKED_CHANGES', ...info };
  }

  // if the client has any unapplied migrations, we should apply those first
  if (
    Object.values(projectMigrationStatuses).some(
      (status) => status === 'UNAPPLIED'
    )
  ) {
    return { status: 'SERVER_BEHIND', ...info };
  }

  // Final check, if all in sync then we're good
  if (
    Object.values(projectMigrationStatuses).every(
      (status) => status === 'IN_SYNC'
    ) &&
    Object.values(serverMigrationStatuses).every(
      (status) => status === 'IN_SYNC'
    )
  ) {
    return { status: 'IN_SYNC', ...info };
  }

  // Something wasnt hit, so we dont know the status
  return { status: 'UNKNOWN', ...info };
}

export function projectHasUntrackedChanges(
  projectFileHash: number | undefined,
  projectMigrationsHash: number | undefined
) {
  // Schemaless (ie no schema file) and an empty schema are treated the same on the client
  const projectFileHasContent = !!projectFileHash;
  const projectMigrationsHasContent = !!projectMigrationsHash;
  const bothEmpty = !projectFileHasContent && !projectMigrationsHasContent;
  // if both empty, no changes
  if (bothEmpty) return false;
  return projectFileHash !== projectMigrationsHash;
}

export async function applyMigration(
  migration: Migration,
  direction: 'up' | 'down',
  ctx: any
) {
  try {
    await ctx.requestServer('POST', '/migration/apply', {
      migration,
      direction,
    });
  } catch (e) {
    console.error(e);
    throw new Error(
      `Error applying ${direction} migration ${migration.version}`
    );
  }
}

type MigrationContext = {
  previousSchema: CollectionsDefinition;
  targetScema: CollectionsDefinition;
};

export function createMigration(
  schemaLeft: CollectionsDefinition,
  schemaRight: CollectionsDefinition,
  version: number,
  parent: number,
  name: string
) {
  const schemaDiff = diff(schemaLeft, schemaRight);
  if (!schemaDiff) return undefined;
  const migration: Migration = { up: [], down: [], version, parent, name };
  const context = { previousSchema: schemaLeft, targetScema: schemaRight };
  parseCollectionDiff(migration, schemaDiff, context);
  return migration;
}

function parseCollectionDiff(
  migration: Migration,
  diff: any,
  context: MigrationContext
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
      migration.up.push(createCollectionOperation);
      migration.down.unshift(dropCollectionOperation);
    } else if (collectionDiffStatus === 'REMOVED') {
      const dropCollectionOperation = genDropCollectionOperation({
        name: collectionKey,
      });
      const collectionDefinition = collectionDiff[0];
      const createCollectionOperation = genCreateCollectionOperation(
        collectionKey,
        collectionDefinition
      );
      migration.up.push(dropCollectionOperation);
      migration.down.unshift(createCollectionOperation);
    } else if (collectionDiffStatus === 'CHANGED') {
      throw new Error('NOT HANDLED. FAILED TO PARSE.');
    } else {
      if (collectionDiff.schema?.properties) {
        parseAttributesDiff(
          migration,
          collectionKey,
          collectionDiff.schema.properties
        );
      }
      if (collectionDiff.rules) {
        parseRulesDiff(migration, collectionKey, collectionDiff.rules, context);
      }
    }
  }
}

function parseAttributesDiff(
  migration: Migration,
  collection: string,
  diff: any,
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
      migration.up.push(addAttributeOperation);
      migration.down.unshift(dropAttributeOperation);
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
      migration.up.push(dropAttributeOperation);
      migration.down.unshift(addAttributeOperation);
    } else if (attributeDiffStatus === 'CHANGED') {
      throw new Error('NOT HANDLED. FAILED TO PARSE.');
    } else {
      if (!!attributeDiff.type) {
        throw new Error(
          `Invalid diff: changing an attribute type is not support. Received diff:\n\n${JSON.stringify(
            attributeDiff,
            null,
            2
          )}`
        );
      }
      // properties implies its a record type...might be nicer to actually read info from the schema
      if (!!attributeDiff.properties) {
        parseAttributesDiff(migration, collection, attributeDiff.properties, [
          ...attributePrefix,
          attributeKey,
        ]);
      }
      // options implies its a leaf type
      else if (!!attributeDiff.options) {
        parseAttributeOptionsDiff(
          migration,
          collection,
          [...attributePrefix, attributeKey],
          attributeDiff.options
        );
      } else {
        throw new Error(
          `Invalid diff: received an unrecognized attribute definition diff\n\n${JSON.stringify(
            attributeDiff,
            null,
            2
          )}`
        );
      }
    }
  }
}

// We could pool all these together
function parseAttributeOptionsDiff(
  migration: Migration,
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
      migration.up.push(newOptionOperation);
      migration.down.unshift(oldOptionOperation);
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
      migration.up.push(newOptionOperation);
      migration.down.unshift(oldOptionOperation);
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
      migration.up.push(newOptionOperation);
      migration.down.unshift(oldOptionOperation);
    } else {
      throw new Error('Failed to create migration: Unexpected diff');
    }
  }
}

function parseRulesDiff(
  migration: Migration,
  collection: string,
  diff: any,
  context: MigrationContext
) {
  const rulesDiffStatus = diffStatus(diff);
  if (rulesDiffStatus === 'ADDED') {
    const rulesDefinition = diff[0];
    for (const ruleType of Object.keys(rulesDefinition)) {
      parseRulesTypeDiff(
        migration,
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
        migration,
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
        migration,
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
  migration: Migration,
  collection: string,
  ruleType: string,
  diff: any,
  context: MigrationContext
) {
  const rulesTypeDiffStatus = diffStatus(diff);
  if (rulesTypeDiffStatus === 'ADDED') {
    const rulesTypeDefinition = diff[0];
    for (const ruleKey of Object.keys(rulesTypeDefinition)) {
      parseRuleDiff(
        migration,
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
        migration,
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
        migration,
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
  migration: Migration,
  collection: string,
  ruleType: string,
  ruleKey: string,
  diff: any,
  context: MigrationContext
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
    migration.up.push(addRuleOperation);
    migration.down.unshift(dropRuleOperation);
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
    migration.up.push(dropRuleOperation);
    migration.down.unshift(addRuleOperation);
  } else if (ruleDiffStatus === 'CHANGED') {
    throw new Error('NOT IMPLEMENTED');
  } else if (ruleDiffStatus === 'UNCHANGED') {
    // json diffing library is too specific with diff, but if we get here a property on the rule has changed
    const oldRule =
      context.previousSchema[collection].rules?.[ruleType][ruleKey];
    const newRule = context.targetScema[collection].rules?.[ruleType][ruleKey];
    // Throwing an error because its unexpected, but I havent really tested if it could happen (I think deleting/adding rules is handled elsewhere)
    if (!oldRule || !newRule) {
      throw new Error('Failed to create migration: Unexpected diff');
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

    migration.up.push(dropOldRuleOperation, addNewRuleOperation);
    migration.down.unshift(dropNewRuleOperation, addOldRuleOperation);
  }
}

function genCreateCollectionOperation(
  name: string,
  collectionDefinition: CollectionDefinition
): CreateCollectionOperation {
  const attributes = collectionDefinition.schema.properties;
  return [
    'create_collection',
    {
      name,
      ...collectionDefinition,
      schema: attributes,
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

function diffStatus(diff: any) {
  if (!Array.isArray(diff)) return 'UNCHANGED';
  if (diff.length === 1) return 'ADDED';
  if (diff.length === 2) return 'CHANGED';
  if (diff.length === 3) return 'REMOVED';
  throw new Error('Invalid diff');
}

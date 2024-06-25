import { TriplitClient } from '@triplit/client';
import {
  AttributeDefinition,
  CollectionDefinition,
  DBTransaction,
  UserTypeOptions,
  diffSchemas,
  getSchemaDiffIssues,
} from '@triplit/db';

export async function createCollection(
  client: TriplitClient<any>,
  collectionName: string,
  schema: {
    [path: string]: AttributeDefinition;
  }
) {
  try {
    const issues = await safeSchemaEdit(client, async (tx) => {
      await tx.createCollection({
        name: collectionName,
        schema,
      });
    });
    if (!issues || issues.length === 0) return;
    if (issues) {
      const parsedIssue = parseIssue(issues[0]);
      return `Creating collection '${collectionName}' failed because: '${parsedIssue}'. Please see the Triplit docs for more information.`;
    }
  } catch (e) {
    console.error(e);
    return `An unknown error occurred creating collection '${collectionName}'.`;
  }
}

export async function dropCollection(
  client: TriplitClient<any>,
  collectionName: string
) {
  try {
    const issues = await safeSchemaEdit(client, async (tx) => {
      await tx.dropCollection({
        name: collectionName,
      });
    });
    if (!issues || issues.length === 0) return;
    if (issues) {
      const parsedIssue = parseIssue(issues[0]);
      return `Dropping collection '${collectionName}' failed because: '${parsedIssue}'. Please see the Triplit docs for more information.`;
    }
  } catch (e) {
    console.error(e);
    return `An unknown error occurred dropping collection '${collectionName}'.`;
  }
}

export async function addAttribute(
  client: TriplitClient<any>,
  collection: string,
  path: string[],
  attribute: AttributeDefinition,
  optional: boolean = false
) {
  try {
    const issues = await safeSchemaEdit(client, async (tx) => {
      await tx.addAttribute({ collection, path, attribute, optional });
    });
    if (!issues || issues.length === 0) return;
    if (issues) {
      const parsedIssue = parseIssue(issues[0]);
      return `Adding '${path.join(
        '.'
      )}' failed because: '${parsedIssue}'. Please see the Triplit docs for more information.`;
    }
  } catch (e) {
    console.error(e);
    return `An unknown error occurred adding attribute '${path.join('.')}'.`;
  }
}

export async function deleteAttribute(
  client: TriplitClient<any>,
  collectionName: string,
  attributeName: string
) {
  try {
    const issues = await safeSchemaEdit(client, async (tx) => {
      await tx.dropAttribute({
        collection: collectionName,
        path: [attributeName],
      });
    });
    if (!issues || issues.length === 0) return;
    if (issues) {
      const parsedIssue = parseIssue(issues[0]);
      return `Deleting '${attributeName}' failed because: '${parsedIssue}'. Please see the Triplit docs for more information.`;
    }
  } catch (e) {
    console.error(e);
    return `An unknown error occurred deleting attribute '${attributeName}'.`;
  }
}

export async function alterAttributeOption(
  client: TriplitClient<any>,
  collection: string,
  path: string[],
  options: UserTypeOptions
) {
  try {
    const issues = await safeSchemaEdit(client, async (tx) => {
      await tx.alterAttributeOption({ collection, path, options });
    });
    if (!issues || issues.length === 0) return;
    if (issues) {
      const parsedIssue = parseIssue(issues[0]);
      return `Altering attribute options at '${path.join(
        '.'
      )}' failed because: '${parsedIssue}'. Please see the Triplit docs for more information.`;
    }
  } catch (e) {
    console.error(e);
    return `An unknown error occurred altering attribute options at '${path.join(
      '.'
    )}'.`;
  }
}

export async function dropAttributeOption(
  client: TriplitClient<any>,
  collection: string,
  path: string[],
  option: string
) {
  try {
    const issues = await safeSchemaEdit(client, async (tx) => {
      await tx.dropAttributeOption({ collection, path, option });
    });
    if (!issues || issues.length === 0) return;
    if (issues) {
      const parsedIssue = parseIssue(issues[0]);
      return `Dropping option '${option}' at '${path.join(
        '.'
      )}' failed because: '${parsedIssue}'. Please see the Triplit docs for more information.`;
    }
  } catch (e) {
    console.error(e);
    return `An unknown error occurred altering dropping option '${option}' at '${path.join(
      '.'
    )}'.`;
  }
}

export async function safeSchemaEdit(
  client: TriplitClient<any>,
  callback: (tx: DBTransaction<any>) => Promise<void>
) {
  const originalSchema = await client.db.getSchema();
  return (
    await client.transact(async (tx) => {
      try {
        await callback(tx);
        if (!originalSchema) return;
        const updatedSchema = await tx.getSchema();
        if (!updatedSchema) return;
        const diff = diffSchemas(originalSchema, updatedSchema);

        // If no differences, return early
        if (diff.length === 0) return;

        const issues = await getSchemaDiffIssues(tx, diff);
        const violations = issues.filter((issue) => issue.violatesExistingData);
        if (!violations.length) return;
        await tx.cancel();
        return violations;
      } catch (e) {
        console.error(e);
        throw e;
      }
    })
  ).output;
}

export function parseIssue(
  issueContext: Awaited<ReturnType<typeof getSchemaDiffIssues>>[number]
) {
  const { issue } = issueContext;
  return issue;
}

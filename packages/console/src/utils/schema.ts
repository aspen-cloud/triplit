import { TriplitClient } from '@triplit/client';
import { DBTransaction, diffSchemas, getSchemaDiffIssues } from '@triplit/db';

export async function safeSchemaEdit(
  client: TriplitClient<any>,
  callback: (tx: DBTransaction<any>) => Promise<void>
) {
  const schema = await client.db.getSchema();
  if (!schema) return;
  return (
    await client.transact(async (tx) => {
      await callback(tx);
      const updatedSchema = await tx.getSchema();
      if (!updatedSchema) return;
      const diff = diffSchemas(schema!, updatedSchema);

      // If no differences, return early
      if (diff.length === 0) return;

      const issues = await getSchemaDiffIssues(tx, diff);
      console.log({});
      await tx.cancel();
      return issues;
    })
  ).output;
}

export function parseIssue(
  issueContext: Awaited<ReturnType<typeof getSchemaDiffIssues>>[number]
) {
  const { issue } = issueContext;
  return issue;
}

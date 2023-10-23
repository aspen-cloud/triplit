import { TripleRow, DB, Models, TriplitError } from '@triplit/db';

export function groupTriplesByTimestamp(triples: TripleRow[]) {
  return triples.reduce((acc, triple) => {
    const txId = getTxId(triple);
    if (!acc[txId]) acc[txId] = [];
    acc[txId].push(triple);
    return acc;
  }, {} as Record<string, TripleRow[]>);
}

// Return a stringified version of the timestamp
function getTxId(triple: TripleRow): string {
  return JSON.stringify(triple.timestamp);
}

export async function insertTriplesByTransaction(
  db: DB<Models<any, any> | undefined>,
  triplesByTransaction: Record<string, TripleRow[]>
): Promise<{
  successes: string[];
  failures: [string, TriplitError][];
}> {
  const successes: string[] = [];
  const failures: [string, TriplitError][] = [];
  try {
    await db.transact(async (dbTx) => {
      const tx = dbTx.storeTx;
      for (const txId in triplesByTransaction) {
        try {
          await tx.insertTriples(triplesByTransaction[txId]);
          successes.push(txId);
        } catch (e) {
          if (e instanceof TriplitError) {
            failures.push([txId, e]);
          } else {
            failures.push([
              txId,
              new TriplitError(
                'An unknown error occurred while inserting triples'
              ),
            ]);
          }
        }
      }
    });
    return { successes, failures };

    // Catch in case of some error while actually inserting the data into the DB
  } catch (e) {
    return {
      successes: [],
      failures: Object.keys(triplesByTransaction).map((txId) => {
        const failure =
          e instanceof TriplitError
            ? e
            : new TriplitError(
                'An unknown error occurred while performing a bulk insert to the triple store'
              );
        return [txId, failure];
      }),
    };
  }
}

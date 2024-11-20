import { TripleRow, DB, Models, TriplitError } from '@triplit/db';

export function groupTriplesByTimestamp(triples: TripleRow[]) {
  return triples.reduce(
    (acc, triple) => {
      const txId = getTxId(triple);
      if (!acc[txId]) acc[txId] = [];
      acc[txId].push(triple);
      return acc;
    },
    {} as Record<string, TripleRow[]>
  );
}

// Return a stringified version of the timestamp
function getTxId(triple: TripleRow): string {
  return JSON.stringify(triple.timestamp);
}

export async function insertTriplesByTransaction(
  db: DB,
  triplesByTransaction: Record<string, TripleRow[]>,
  skipRules = false
): Promise<{
  successes: string[];
  failures: [string, TriplitError][];
}> {
  const successes: string[] = [];
  const failures: [string, TriplitError][] = [];
  try {
    // This plays weird with hooks, because everything is in a single transaciton here, so one failing client tx in a hook will fail all of them
    await db.transact(
      async (dbTx) => {
        const tx = dbTx.storeTx;
        for (const txId in triplesByTransaction) {
          try {
            await tx.insertTriples(triplesByTransaction[txId]);
            successes.push(txId);
          } catch (e) {
            if (isTriplitError(e)) {
              failures.push([txId, e]);
            } else {
              console.error(e);
              failures.push([
                txId,
                new TriplitError(
                  'An unknown error occurred while inserting triples'
                ),
              ]);
            }
          }
        }
      },
      { skipRules }
    );
    return { successes, failures };

    // Catch in case of some error while actually inserting the data into the DB
  } catch (e) {
    return {
      successes: [],
      failures: Object.keys(triplesByTransaction).map((txId) => {
        const failure = isTriplitError(e)
          ? e
          : new TriplitError(
              'An unknown error occurred while performing a bulk insert to the triple store'
            );
        return [txId, failure];
      }),
    };
  }
}

// For some reason in cloudflare workers instanceof doesn't work for custom errors
// I think this might be related to the nature of how we bundle and deploy
// Fallback to checking for a property as a backup
export function isTriplitError(e: any): e is TriplitError {
  return e instanceof TriplitError || e?.__isTriplitError === true;
}

import DB from '../../src/db.js';
import { Models } from '../../src/schema/types';
import { DBTransaction } from '../../src/db-transaction.js';

export async function testDBAndTransaction<M extends Models>(
  // should return a new instance if you are performing writes in your test
  dbFactory: () => DB<M> | Promise<DB<M>>,
  test: (db: DB<M> | DBTransaction<M>) => void | Promise<void>,
  scope: { db: boolean; tx: boolean } = { db: true, tx: true }
) {
  if (scope.db) await test(await dbFactory());
  if (scope.tx)
    await (
      await dbFactory()
    ).transact(async (tx) => {
      await test(tx);
    });
}

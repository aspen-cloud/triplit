import { CollectionQuery, DB, FetchResult, Model, Query } from '../../src';

interface Step<Q extends CollectionQuery<any, any>> {
  action: (results: FetchResult<Q>) => Promise<void> | void;
  check: (results: FetchResult<Q>) => Promise<void> | void;
}

type Steps<Q extends CollectionQuery<any, any>> = [
  Pick<Step<Q>, 'check'>,
  ...Step<Q>[]
];

export async function testSubscription<Q extends CollectionQuery<any, any>>(
  db: DB<any>,
  query: Q,
  steps: Steps<Q>
) {
  return new Promise<void>((resolve, reject) => {
    let stepIndex = 0;
    db.subscribe(query, async (results) => {
      try {
        await steps[stepIndex].check(results);
        stepIndex++;
        if (stepIndex >= steps.length) {
          return resolve();
        }
        await steps[stepIndex].action(results);
      } catch (e) {
        reject(e);
      }
    });
  });
}

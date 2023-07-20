import { Clock } from './clocks/clock';
import { TripleRow, TripleStoreTransaction } from './triple-store';
import { objectToTuples } from './utils';

// TODO change to object for params
export async function insert(
  store: TripleStoreTransaction,
  id: string,
  document: Record<string, any>,
  clock: Clock,
  collectionName?: string
) {
  const extendedTuples = objectToTuples(document);

  const avRows = extendedTuples.map((pathVal) => {
    if (pathVal.length === 0)
      throw new Error('Empty tuple generated for document');
    return {
      attribute: [
        ...(collectionName ? [collectionName] : []),
        ...(pathVal.slice(0, -1) as string[]),
      ],
      value: pathVal.at(-1) as string | number | null,
    };
  });
  const timestamp = await clock.getNextTimestamp();
  const triples: TripleRow[] = avRows.map<TripleRow>(
    ({ attribute, value }) => ({
      id,
      attribute,
      value,
      timestamp,
      expired: false,
    })
  );

  if (collectionName) {
    triples.push({
      id,
      attribute: ['_collection'],
      value: collectionName,
      timestamp,
      expired: false,
    });
  }
  await store.insertTriples(triples);
}

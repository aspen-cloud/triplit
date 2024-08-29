import type {
  KeyValuePair,
  ScanStorageArgs,
  AsyncTupleStorageApi,
  WriteOps,
} from '@triplit/tuple-database';
import { decodeTuple, encodeTuple } from '@triplit/tuple-database';
import type { DurableObjectStorage } from '@cloudflare/workers-types';

// Max 128 keys per put
// https://developers.cloudflare.com/durable-objects/api/transactional-storage-api/#put
const WRITE_LIMIT = 120;

export default class DurableObjectStore implements AsyncTupleStorageApi {
  doStore: DurableObjectStorage;
  constructor(doStore: DurableObjectStorage) {
    this.doStore = doStore;
  }

  async scan(args?: ScanStorageArgs | undefined): Promise<KeyValuePair[]> {
    const lowerLimit = args?.gte
      ? { start: encodeTuple(args.gte) }
      : args?.gt
      ? { startAfter: encodeTuple(args.gt) }
      : undefined;
    const upperLimit = args?.lte ?? args?.lt;
    const items = await this.doStore.list({
      ...lowerLimit,
      limit: args?.limit,
      reverse: args?.reverse,
      end: upperLimit && encodeTuple(upperLimit),
      allowConcurrency: true,
    });
    return [...items].map(([k, v]) => ({ key: decodeTuple(k), value: v }));
  }

  async commit(writes: WriteOps<KeyValuePair>): Promise<void> {
    const { set, remove } = writes;
    if (set && set.length > 0) {
      await applyInChunks(set, WRITE_LIMIT, async (chunk) => {
        await this.doStore.put(
          Object.fromEntries(
            chunk.map(({ key, value }) => [encodeTuple(key), value])
          ),
          {
            allowConcurrency: true,
            allowUnconfirmed: true,
          }
        );
      });
    }
    if (remove && remove.length > 0) {
      await applyInChunks(remove, WRITE_LIMIT, async (chunk) => {
        await this.doStore.delete(
          chunk.map((tupleKey) => encodeTuple(tupleKey)),
          {
            allowConcurrency: true,
            allowUnconfirmed: false,
          }
        );
      });
    }
  }

  async clear(): Promise<void> {
    await this.doStore.deleteAll();
  }

  async close(): Promise<void> {}
}

async function applyInChunks<T>(
  items: T[],
  chunk_size: number,
  callback: (chunk: T[]) => Promise<void>
) {
  for (let i = 0; i < items.length; i += chunk_size) {
    await callback(items.slice(i, i + chunk_size));
  }
}

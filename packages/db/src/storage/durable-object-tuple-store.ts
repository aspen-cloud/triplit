import type {
  KeyValuePair,
  ScanStorageArgs,
  AsyncTupleStorageApi,
  WriteOps,
} from '@triplit/tuple-database';
import { decodeTuple, encodeTuple } from '@triplit/tuple-database';
import type { DurableObjectStorage } from '@cloudflare/workers-types';

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
      await this.doStore.put(
        Object.fromEntries(
          set?.map(({ key, value }) => [encodeTuple(key), value])
        ),
        {
          allowConcurrency: true,
          allowUnconfirmed: true,
        }
      );
    }
    if (remove && remove.length > 0) {
      await this.doStore.delete(
        remove.map((tupleKey) => encodeTuple(tupleKey)),
        {
          allowConcurrency: true,
          allowUnconfirmed: true,
        }
      );
    }
  }
  async close(): Promise<void> {}
}

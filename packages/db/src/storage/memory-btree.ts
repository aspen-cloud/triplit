import {
  KeyValuePair,
  MAX,
  MIN,
  ScanStorageArgs,
  Tuple,
  TupleStorageApi,
  WriteOps,
} from 'tuple-database';
import { compareTuple } from 'tuple-database/helpers/compareTuple';
import BTree from 'sorted-btree';

// Hack for https://github.com/qwertie/btree-typescript/issues/36
// @ts-ignore
const BTreeClass = (BTree.default ? BTree.default : BTree) as typeof BTree;
export default class MemoryBTree implements TupleStorageApi {
  btree: BTree<any, any>;
  constructor() {
    this.btree = new BTreeClass<Tuple, any>(undefined, compareTuple);
  }
  scan(args?: ScanStorageArgs | undefined): KeyValuePair[] {
    // const { start, end, limit, reverse } = args || {}
    const low = args?.gte ?? args?.gt ?? MIN;
    const high = args?.lte ?? args?.lt ?? MAX;
    const results: KeyValuePair[] = [];
    this.btree.forRange(
      low,
      high,
      args?.lte != null,
      (key, value, n) => {
        results.push({ key, value });
        if (args?.limit && n >= args.limit) return { break: n };
        return;
      },
      args?.gte != null ? 0 : -1
    );
    if (args?.reverse) results.reverse();
    return results;
  }
  commit(writes: WriteOps<KeyValuePair>): void {
    const { set, remove } = writes;
    for (const tuple of remove || []) {
      this.btree.delete(tuple);
    }
    for (const { key, value } of set || []) {
      this.btree.set(key, value);
    }
  }
  close(): void {}

  wipe(): void {
    this.btree = new BTreeClass<Tuple, any>(undefined, compareTuple);
  }
}

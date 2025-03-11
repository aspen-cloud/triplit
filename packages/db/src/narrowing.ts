import { KVStoreOrTransaction, KVStoreTransaction } from './types.js';

export function isTransaction(
  storage: KVStoreOrTransaction
): storage is KVStoreTransaction {
  return (storage as KVStoreTransaction).commit !== undefined;
}

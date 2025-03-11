import { FetchOptions as DBFetchOptions } from '@triplit/db';

export type LocalFirstFetchOptions = {
  policy: 'local-first';
};
export type LocalOnlyFetchOptions = {
  policy: 'local-only';
};
export type RemoteFirstFetchOptions = {
  policy: 'remote-first';
};
export type RemoteOnlyFetchOptions = {
  /**
   * @deprecated - use `TriplitClient.http.fetch` instead
   */
  policy: 'remote-only';
};
export type LocalAndRemoteFetchOptions = {
  policy: 'local-and-remote';
  timeout?: number;
};
export type SyncStatus = 'pending' | 'confirmed' | 'all';
export type ClientFetchOptions = DBFetchOptions & {
  syncStatus?: SyncStatus;
} & (
    | LocalFirstFetchOptions
    | LocalOnlyFetchOptions
    | RemoteFirstFetchOptions
    | RemoteOnlyFetchOptions
    | LocalAndRemoteFetchOptions
  );

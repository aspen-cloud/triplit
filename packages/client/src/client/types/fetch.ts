import { DBFetchOptions } from '@triplit/db';

export type ClientDBFetchOptions = Pick<DBFetchOptions, 'noCache'>;

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
export type FetchOptions = ClientDBFetchOptions &
  (
    | LocalFirstFetchOptions
    | LocalOnlyFetchOptions
    | RemoteFirstFetchOptions
    | RemoteOnlyFetchOptions
    | LocalAndRemoteFetchOptions
  );

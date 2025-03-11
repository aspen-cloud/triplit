/// <reference types="svelte" />

import type {
  Models,
  SchemaQuery,
  SubscriptionOptions,
  SubscriptionSignalPayload,
  TriplitClient,
} from '@triplit/client';

/**
 * A hook that subscribes to a query
 *
 * @param client - The client instance to query with
 * @param query - The query to subscribe to
 * @param options - Additional options for the subscription
 * @param options.localOnly - If true, the subscription will only use the local cache. Defaults to false.
 * @param options.onRemoteFulfilled - An optional callback that is called when the remote query has been fulfilled.
 * @returns An object containing the fetching state, the result of the query, any error that occurred, and a function to update the query
 */
export function useQuery<M extends Models<M>, Q extends SchemaQuery<M>>(
  client: TriplitClient<M>,
  query: Q,
  options?: Partial<SubscriptionOptions>
): SubscriptionSignalPayload<M, Q> {
  let results: SubscriptionSignalPayload<M, Q>['results'] = $state(undefined);
  let fetching = $state(true);
  let fetchingLocal = $state(true);
  let fetchingRemote = $state(false);
  let error: any = $state(undefined);

  $effect(() => {
    const unsub = client.subscribeWithStatus(
      query,
      (newVal) => {
        results = newVal.results;
        fetching = newVal.fetching;
        fetchingLocal = newVal.fetchingLocal;
        fetchingRemote = newVal.fetchingRemote;
        error = newVal.error;
      },
      options
    );

    return unsub;
  });

  return {
    get fetching() {
      return fetching;
    },
    get fetchingLocal() {
      return fetchingLocal;
    },
    get fetchingRemote() {
      return fetchingRemote;
    },
    get results() {
      return results;
    },
    get error() {
      return error;
    },
  };
}

/**
 * A hook that subscribes to the connection status of a client with the server
 *
 * @param client - The client instance to get the connection status of
 * @returns An object containing `status`, the current connection status of the client with the server
 */
export function useConnectionStatus(client: TriplitClient<any>) {
  let status = $state(client.connectionStatus);

  $effect(() => {
    const unsub = client.onConnectionStatusChange((newStatus) => {
      status = newStatus;
    }, true);
    return () => {
      unsub();
    };
  });

  return {
    get status() {
      return status;
    },
  };
}

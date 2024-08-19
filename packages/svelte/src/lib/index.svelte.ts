/// <reference types="svelte" />

import type {
  ClientFetchResult,
  ClientQuery,
  ClientQueryBuilder,
  CollectionNameFromModels,
  Models,
  SubscriptionOptions,
  TriplitClient,
  Unalias,
} from '@triplit/client';
import { WorkerClient } from '@triplit/client/worker-client';

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
export function useQuery<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  Q extends ClientQuery<M, CN>
>(
  client: TriplitClient<M> | WorkerClient<M>,
  query: ClientQueryBuilder<M, CN, Q>,
  options?: Partial<SubscriptionOptions>
): {
  fetching: boolean;
  fetchingLocal: boolean;
  fetchingRemote: boolean;
  results: Unalias<ClientFetchResult<M, Q>> | undefined;
  error: any;
  updateQuery: (query: ClientQueryBuilder<M, CN, Q>) => void;
} {
  let results: Unalias<ClientFetchResult<M, Q>> | undefined = $state(undefined);
  let isInitialFetch = $state(true);
  let fetchingLocal = $state(false);
  let fetchingRemote = $state(client.connectionStatus !== 'CLOSED');
  let fetching = $derived(fetchingLocal || (isInitialFetch && fetchingRemote));
  let error: any = $state(undefined);
  let hasResponseFromServer = false;
  let builtQuery = $state(query && query.build());

  function updateQuery(query: ClientQueryBuilder<M, CN, Q>) {
    builtQuery = query.build();
    results = undefined;
    fetchingLocal = true;
    hasResponseFromServer = false;
  }

  $effect(() => {
    client
      .isFirstTimeFetchingQuery($state.snapshot(builtQuery))
      .then((isFirstFetch) => {
        isInitialFetch = isFirstFetch;
      });
    const unsub = client.onConnectionStatusChange((status) => {
      if (status === 'CLOSING' || status === 'CLOSED') {
        fetchingRemote = false;
        return;
      }
      if (status === 'OPEN' && hasResponseFromServer === false) {
        fetchingRemote = true;
        return;
      }
    }, true);
    return () => {
      unsub();
    };
  });

  $effect(() => {
    const unsubscribe = client.subscribe(
      $state.snapshot(builtQuery),
      (localResults) => {
        fetchingLocal = false;
        error = undefined;
        results = new Map(localResults as any);
      },
      (error) => {
        fetchingLocal = false;
        error = error;
      },
      {
        ...(options ?? {}),
        onRemoteFulfilled: () => {
          hasResponseFromServer = true;
          fetchingRemote = false;
        },
      }
    );
    return () => {
      unsubscribe();
    };
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
    updateQuery,
  };
}

/**
 * A hook that subscribes to the connection status of a client with the server
 *
 * @param client - The client instance to get the connection status of
 * @returns An object containing `status`, the current connection status of the client with the server
 */
export function useConnectionStatus(
  client: TriplitClient<any> | WorkerClient<any>
) {
  let status = $state('CONNECTING');

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

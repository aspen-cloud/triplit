/// <reference types="svelte" />

import type {
  ClientFetchResult,
  ClientQuery,
  QueryBuilder,
  Models,
  SubscriptionOptions,
  TriplitClient,
} from '@triplit/client';
import { WorkerClient } from '@triplit/client/worker-client';

export function useQuery<
  M extends Models<any, any> | undefined,
  Q extends ClientQuery<M, any, any, any>
>(
  client: TriplitClient<any> | WorkerClient<any>,
  query: QueryBuilder<Q>,
  options?: Partial<SubscriptionOptions>
): {
  fetching: boolean;
  fetchingLocal: boolean;
  fetchingRemote: boolean;
  results: ClientFetchResult<Q> | undefined;
  error: any;
  updateQuery: (query: QueryBuilder<Q>) => void;
} {
  let results: ClientFetchResult<Q> | undefined = $state(undefined);
  let isInitialFetch = $state(true);
  let fetchingLocal = $state(false);
  let fetchingRemote = $state(client.connectionStatus !== 'CLOSED');
  let fetching = $derived(fetchingLocal || (isInitialFetch && fetchingRemote));
  let error: any = $state(undefined);
  let hasResponseFromServer = false;
  let builtQuery = $state(query && query.build());

  function updateQuery(query: QueryBuilder<Q>) {
    builtQuery = query.build();
    results = undefined;
    fetchingLocal = true;
    hasResponseFromServer = false;
  }

  $effect(() => {
    client.isFirstTimeFetchingQuery(builtQuery).then((isFirstFetch) => {
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
      builtQuery,
      (localResults) => {
        fetchingLocal = false;
        error = undefined;
        results = new Map(localResults);
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

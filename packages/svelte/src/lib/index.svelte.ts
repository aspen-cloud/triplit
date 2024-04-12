/// <reference types="svelte" />

import type {
  ClientFetchResult,
  ClientQuery,
  ClientQueryBuilder,
  CollectionNameFromModels,
  Models,
  SubscriptionOptions,
  TriplitClient,
} from '@triplit/client';

export function useQuery<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(
  client: TriplitClient<any>,
  query: ClientQueryBuilder<M, CN>,
  options?: Partial<SubscriptionOptions>
): {
  fetching: boolean;
  fetchingLocal: boolean;
  fetchingRemote: boolean;
  results: ClientFetchResult<ClientQuery<M, CN>> | undefined;
  error: any;
  updateQuery: (query: ClientQueryBuilder<M, CN>) => void;
} {
  let results: ClientFetchResult<ClientQuery<M, CN>> | undefined =
    $state(undefined);
  let isInitialFetch = $state(true);
  let fetchingLocal = $state(false);
  let fetchingRemote = $state(client.syncEngine.connectionStatus !== 'CLOSED');
  let fetching = $derived(isInitialFetch && fetchingRemote);
  let error: any = $state(undefined);
  let hasResponseFromServer = false;
  let builtQuery = $state(query && query.build());

  function updateQuery(query: ClientQueryBuilder<M, CN>) {
    builtQuery = query.build();
    results = undefined;
    fetchingLocal = true;
    hasResponseFromServer = false;
  }

  $effect(() => {
    client.syncEngine
      .isFirstTimeFetchingQuery(builtQuery)
      .then((isFirstFetch) => {
        isInitialFetch = isFirstFetch;
      });
    const unsub = client.syncEngine.onConnectionStatusChange((status) => {
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
        results = new Map(localResults) as ClientFetchResult<
          ClientQuery<M, CN>
        >;
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

export function useConnectionStatus(client: TriplitClient<any>) {
  let status = $state('CONNECTING');

  $effect(() => {
    const unsub = client.syncEngine.onConnectionStatusChange((newStatus) => {
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

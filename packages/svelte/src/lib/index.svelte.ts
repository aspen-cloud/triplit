/// <reference types="svelte" />

import type {
  CollectionNameFromModels,
  FetchResult,
  Models,
  SchemaQuery,
  SubscriptionSignalPayload,
  TriplitClient,
  EnabledSubscriptionOptions,
} from '@triplit/client';
import {
  getInitialState,
  getDisabledSubscriptionState,
  isSubscriptionEnabled,
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
export function useQuery<M extends Models<M>, Q extends SchemaQuery<M>>(
  client: TriplitClient<M> | WorkerClient<M>,
  query: Q,
  options?: Partial<EnabledSubscriptionOptions>
): SubscriptionSignalPayload<M, Q> {
  const initialState = getInitialState<M, Q>(options);

  let results: SubscriptionSignalPayload<M, Q>['results'] = $state(
    initialState.results
  );
  let fetching = $state(initialState.fetching);
  let fetchingLocal = $state(initialState.fetchingLocal);
  let fetchingRemote = $state(initialState.fetchingRemote);
  let error: any = $state(initialState.error);

  $effect(() => {
    if (!isSubscriptionEnabled(options)) {
      const disabledState = getDisabledSubscriptionState<M, Q>();
      results = disabledState.results;
      fetching = disabledState.fetching;
      fetchingLocal = disabledState.fetchingLocal;
      fetchingRemote = disabledState.fetchingRemote;
      error = disabledState.error;
      return;
    }

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
export function useConnectionStatus(
  client: TriplitClient<any> | WorkerClient<any>
) {
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

/**
 * A hook that subscribes to a query and fetches only one result
 *
 * @param client - The client instance to query with
 * @param query - The query to subscribe to
 * @param options - Additional options for the subscription
 * @returns An object containing the fetching state, the result of the query, and any error that occurred
 */
export function useQueryOne<M extends Models<M>, Q extends SchemaQuery<M>>(
  client: TriplitClient<M> | WorkerClient<M>,
  query: Q,
  options?: Partial<EnabledSubscriptionOptions>
): Omit<SubscriptionSignalPayload<M, Q>, 'results'> & {
  result: FetchResult<M, Q, 'one'>;
} {
  const queryPayload = useQuery(client, { ...query, limit: 1 }, options);
  return {
    get fetching() {
      return queryPayload.fetching;
    },
    get fetchingLocal() {
      return queryPayload.fetchingLocal;
    },
    get fetchingRemote() {
      return queryPayload.fetchingRemote;
    },
    get result() {
      return queryPayload.results?.[0] ?? null;
    },
    get error() {
      return queryPayload.error;
    },
  };
}

/**
 * A hook that subscribes to an entity
 *
 * @param client - The client instance to query with
 * @param collectionName - The name of the collection to query
 * @param id - The id of the entity to query
 * @param options - Additional options for the subscription
 * @returns - An object containing the fetching state, the result of the query, and any error that occurred
 */
export function useEntity<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
>(
  client: TriplitClient<M> | WorkerClient<M>,
  collectionName: CN,
  id: string,
  options?: Partial<EnabledSubscriptionOptions>
) {
  return useQueryOne(client, client.query(collectionName).Id(id), options);
}

import { createSignal, createEffect, onCleanup, Accessor } from 'solid-js';
import {
  TriplitClient,
  SubscriptionOptions,
  ConnectionStatus,
  Models,
  SchemaQuery,
  FetchResult,
} from '@triplit/client';
import { WorkerClient } from '@triplit/client/worker-client';

// Minimally adapted from @doeixd's example https://github.com/aspen-cloud/triplit/issues/147#issuecomment-2755080098

/**
 * A primitive that subscribes to a query.
 *
 * @param client - The client instance to query with.
 * @param query - The query to subscribe to.
 * @param options - Optional accessor for additional options for the subscription.
 * @param options.localOnly - If true, the subscription will only use the local cache. Defaults to false.
 * @param options.onRemoteFulfilled - An optional callback that is called when the remote query has been fulfilled.
 * @returns An object containing accessors for the fetching state, the result of the query, and any error that occurred.
 */
export function useQuery<M extends Models<M>, Q extends SchemaQuery<M>>(
  client: TriplitClient<M> | WorkerClient<M>,
  query: Q,
  options?: Accessor<Partial<SubscriptionOptions>>
) {
  const [results, setResults] = createSignal<
    FetchResult<M, Q, 'many'> | undefined
  >(undefined);
  const [fetching, setFetching] = createSignal<boolean>(true);
  const [fetchingLocal, setFetchingLocal] = createSignal<boolean>(true);
  const [fetchingRemote, setFetchingRemote] = createSignal<boolean>(false);
  const [error, setError] = createSignal<Error | undefined>(undefined);
  const [querySignal, setQuery] = createSignal<Q>(query); // Ensure we can track query changes

  createEffect(() => {
    const currentClient = client;
    const currentQuery = querySignal();
    const currentOptions = options ? options() : undefined;

    // Reset state when query/client/options change before subscribing
    setResults(undefined);
    setFetching(true);
    setFetchingLocal(true);
    setFetchingRemote(true);
    setError(undefined);

    const unsub = currentClient.subscribeWithStatus(
      currentQuery,
      (newVal) => {
        setResults(newVal.results);
        setFetching(newVal.fetching);
        setFetchingLocal(newVal.fetchingLocal);
        setFetchingRemote(newVal.fetchingRemote);
        setError(newVal.error);
      },
      currentOptions
    );

    onCleanup(() => {
      unsub();
    });
  });

  return {
    results,
    fetching,
    fetchingLocal,
    fetchingRemote,
    error,
    setQuery, // Expose setQuery to allow external updates to the query being subscribed to
  };
}

/**
 * A primitive that subscribes to the connection status of a client with the server.
 *
 * @param client - The client instance to get the connection status of.
 * @returns An object containing `status`, an accessor for the current connection status.
 */
export function useConnectionStatus(client: TriplitClient) {
  // Initialize with the current status
  const [status, setStatus] = createSignal<ConnectionStatus>(
    client.connectionStatus
  );

  createEffect(() => {
    const currentClient = client; // Track client changes

    // Update signal if status changed between initial signal creation and effect run
    // Or if the client instance itself changed.
    const initialStatus = currentClient.connectionStatus;
    if (status() !== initialStatus) {
      setStatus(initialStatus);
    }

    const unsub = currentClient.onConnectionStatusChange((newStatus) => {
      setStatus(newStatus);
    }, true);

    onCleanup(() => {
      unsub();
    });
  });

  return {
    status,
  };
}

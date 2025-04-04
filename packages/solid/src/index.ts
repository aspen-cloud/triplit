import { createSignal, createEffect, onCleanup, Accessor } from 'solid-js';
import {
  TriplitClient,
  CollectionQuery,
  SubscriptionOptions,
  ConnectionStatus,
} from '@triplit/client';

/**
 * A primitive that subscribes to a query.
 *
 * @param client - The client instance accessor to query with.
 * @param query - The query accessor to subscribe to.
 * @param options - Optional accessor for additional options for the subscription.
 * @param options.localOnly - If true, the subscription will only use the local cache. Defaults to false.
 * @param options.onRemoteFulfilled - An optional callback that is called when the remote query has been fulfilled.
 * @returns An object containing accessors for the fetching state, the result of the query, and any error that occurred.
 */
export function useQuery<T extends CollectionQuery>(
  client: TriplitClient,
  query: T,
  options?: Accessor<Partial<SubscriptionOptions>>
) {
  const [results, setResults] = createSignal<T | undefined>(undefined);
  const [fetching, setFetching] = createSignal<boolean>(true);
  const [fetchingLocal, setFetchingLocal] = createSignal<boolean>(true);
  const [fetchingRemote, setFetchingRemote] = createSignal<boolean>(false);
  const [error, setError] = createSignal<Error | undefined>(undefined);
  const [querySignal, setQuery] = createSignal<T>(query); // Ensure we can track query changes

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

    const unsub = currentClient.subscribeWithStatus<T>(
      currentQuery,
      (newVal) => {
        console.dir(newVal);
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
 * @param client - The client instance accessor to get the connection status of.
 * @returns An object containing `status`, an accessor for the current connection status.
 */
export function useConnectionStatus(
  client: TriplitClient // Use Accessor if client can change
) {
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

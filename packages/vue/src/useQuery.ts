import { reactive, watchEffect } from 'vue';
import type {
  Models,
  SubscriptionOptions,
  TriplitClient,
  SchemaQuery,
  SubscriptionSignalPayload,
} from '@triplit/client';

/**
 * A composable that subscribes to a query
 *
 * @param client - The client instance to query with
 * @param query - The query to subscribe to
 * @param options - Additional options for the subscription
 * @param options.localOnly - If true, the subscription will only use the local cache. Defaults to false.
 * @param options.onRemoteFulfilled - An optional callback that is called when the remote query has been fulfilled. * @returns An object containing the fetching state, the result of the query, any error that occurred, and a function to update the query
 */
export function useQuery<M extends Models<M>, Q extends SchemaQuery<M>>(
  client: TriplitClient<M>,
  query: Q,
  options?: Partial<SubscriptionOptions>
) {
  const state = reactive<SubscriptionSignalPayload<M, Q>>({
    results: undefined,
    fetching: true,
    fetchingLocal: true,
    fetchingRemote: false,
    error: undefined,
  });

  watchEffect((onCleanup) => {
    const unsubscribe = client.subscribeWithStatus(
      query,
      (newResults) => {
        state.fetching = newResults.fetching;
        state.fetchingLocal = newResults.fetchingLocal;
        state.fetchingRemote = newResults.fetchingRemote;
        state.error = newResults.error;
        // @ts-expect-error
        state.results = newResults.results;
      },
      options
    );
    onCleanup(unsubscribe);
  });
  return state;
}

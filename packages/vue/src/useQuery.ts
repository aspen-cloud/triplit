import { Ref, computed, ref, watchEffect, type ComputedRef } from 'vue';
import type {
  ClientFetchResult,
  ClientQuery,
  ClientQueryBuilder,
  Models,
  SubscriptionOptions,
  TriplitClient,
  Unalias,
} from '@triplit/client';
import { WorkerClient } from '@triplit/client/worker-client';

export function useQuery<
  M extends Models<any, any> | undefined,
  Q extends ClientQuery<M, any, any, any>
>(
  client: TriplitClient<any> | WorkerClient<any>,
  query: ClientQueryBuilder<Q>,
  options?: Partial<SubscriptionOptions>
): {
  fetching: ComputedRef<boolean>;
  fetchingLocal: ComputedRef<boolean>;
  fetchingRemote: ComputedRef<boolean>;
  results: ComputedRef<Unalias<ClientFetchResult<Q>> | undefined>;
  error: ComputedRef<unknown>;
  updateQuery: (query: ClientQueryBuilder<Q>) => void;
} {
  const results = ref<Unalias<ClientFetchResult<Q>> | undefined>(
    undefined
  ) as Ref<Unalias<ClientFetchResult<Q>> | undefined>;
  const isInitialFetch = ref(true);
  const fetchingLocal = ref(false);
  const fetchingRemote = ref(client.connectionStatus !== 'CLOSED');
  const fetching = computed(
    () => fetchingLocal.value || (isInitialFetch.value && fetchingRemote.value)
  );
  const error = ref<unknown>(undefined);
  let hasResponseFromServer = false;

  const builtQuery = ref(query && query.build()) as Ref<Q>;

  function updateQuery(query: ClientQueryBuilder<Q>) {
    builtQuery.value = query.build();
    results.value = undefined;
    fetchingLocal.value = true;
    hasResponseFromServer = false;
  }

  watchEffect(() => {
    client.isFirstTimeFetchingQuery(builtQuery.value).then((isFirstFetch) => {
      isInitialFetch.value = isFirstFetch;
    });
    const unsub = client.onConnectionStatusChange((status) => {
      if (status === 'CLOSING' || status === 'CLOSED') {
        fetchingRemote.value = false;
        return;
      }
      if (status === 'OPEN' && hasResponseFromServer === false) {
        fetchingRemote.value = true;
        return;
      }
    }, true);
    return () => {
      unsub();
    };
  });

  watchEffect(() => {
    const unsubscribe = client.subscribe(
      builtQuery.value,
      (newResults) => {
        fetchingLocal.value = false;
        error.value = undefined;
        results.value = newResults;
      },
      (err) => {
        fetchingLocal.value = false;
        error.value = err;
      },
      {
        ...(options ?? {}),
        onRemoteFulfilled: () => {
          hasResponseFromServer = true;
          fetchingRemote.value = false;
        },
      }
    );
    return () => {
      unsubscribe();
    };
  });

  return {
    fetching,
    fetchingLocal: computed(() => fetchingLocal.value),
    fetchingRemote: computed(() => fetchingRemote.value),
    results: computed(() => results.value),
    error: computed(() => error.value),
    updateQuery,
  };
}

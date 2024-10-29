import type {
  FetchResult,
  ClientQuery,
  ClientQueryBuilder,
  CollectionNameFromModels,
  Models,
  SubscriptionOptions,
  TriplitClient,
  Unalias,
} from '@triplit/client';
// import { WorkerClient } from '@triplit/client/worker-client';
import {
  DestroyRef,
  Injector,
  Signal,
  computed,
  effect,
  inject,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { assertInjector } from './util/assert-injector';

type QueryResults<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  Q extends ClientQuery<M, CN>
> = {
  fetching: Signal<boolean>;
  fetchingLocal: Signal<boolean>;
  fetchingRemote: Signal<boolean>;
  results: Signal<Unalias<FetchResult<M, Q>> | undefined>;
  error: Signal<any>;
};

type QueryParams<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  Q extends ClientQuery<M, CN>
> = () => {
  client: TriplitClient<M>;
  query: ClientQueryBuilder<M, CN, Q>;
  options?: Partial<SubscriptionOptions>;
};

export function injectQuery<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  Q extends ClientQuery<M, CN>
>(
  // TODO: make add WorkerClient to type
  queryFn: QueryParams<M, CN, Q>,
  injector?: Injector
): QueryResults<M, CN, Q> {
  return assertInjector(injectQuery, injector, () => {
    return createBaseQuery(queryFn);
  });
}

function createBaseQuery<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  Q extends ClientQuery<M, CN>
>(queryFn: QueryParams<M, CN, Q>): QueryResults<M, CN, Q> {
  const injector = inject(Injector);
  const destroyRef = injector.get(DestroyRef);

  /**
   * computed() is used so signals can be inserted into the options
   * making it reactive. Wrapping queryParams in a function ensures embedded expressions
   * are preserved and can keep being applied after signal changes
   */
  const queryParamsSignal = computed(() => {
    return runInInjectionContext(injector, () => queryFn());
  });

  const resultSignal = signal<FetchResult<M, Q> | undefined>(undefined);
  const fetchingLocalSignal = signal(true);
  const fetchingRemoteSignal = signal(
    queryParamsSignal().client.connectionStatus !== 'CLOSED'
  );
  const errorSignal = signal<Error | undefined>(undefined);
  const isInitialFetchSignal = signal(true);
  const hasResponseFromServer = signal(false);
  const builtQuerySignal = signal(queryParamsSignal().query.build());

  effect(
    (onCleanup) => {
      const queryParams = queryParamsSignal();
      queryParams.client
        .isFirstTimeFetchingQuery(builtQuerySignal())
        .then((isFirstFetch) => {
          isInitialFetchSignal.set(isFirstFetch);
        });
      const unsub = queryParams.client.onConnectionStatusChange((status) => {
        if (status === 'CLOSING' || status === 'CLOSED') {
          fetchingRemoteSignal.set(false);
          return;
        }
        if (status === 'OPEN' && hasResponseFromServer() === false) {
          fetchingRemoteSignal.set(true);
          return;
        }
      }, true);
      onCleanup(() => {
        unsub();
      });
    },
    { allowSignalWrites: true }
  );

  effect(
    (onCleanup) => {
      const queryParams = queryParamsSignal();
      resultSignal.set(undefined);
      fetchingLocalSignal.set(true);
      const unsubscribe = queryParams.client.subscribe(
        builtQuerySignal(),
        (localResults) => {
          fetchingLocalSignal.set(false);
          errorSignal.set(undefined);
          resultSignal.set(localResults as any);
        },
        (error) => {
          fetchingLocalSignal.set(false);
          errorSignal.set(error);
        },
        {
          ...(queryParams.options ?? {}),
          onRemoteFulfilled: () => {
            hasResponseFromServer.set(true);
            fetchingRemoteSignal.set(false);
          },
        }
      );
      onCleanup(() => {
        unsubscribe();
      });
    },
    { allowSignalWrites: true }
  );

  return {
    fetching: computed(
      () =>
        fetchingLocalSignal() ||
        (isInitialFetchSignal() && fetchingRemoteSignal())
    ),
    fetchingLocal: computed(() => fetchingLocalSignal()),
    fetchingRemote: computed(() => fetchingRemoteSignal()),
    // @ts-ignore
    results: computed(() => resultSignal()),
    error: computed(() => errorSignal()),
  };
}

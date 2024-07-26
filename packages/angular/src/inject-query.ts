import type {
  ClientFetchResult,
  ClientQuery,
  ClientQueryBuilder,
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
  M extends Models<any, any> | undefined,
  Q extends ClientQuery<M, any, any, any>
> = {
  fetching: Signal<boolean>;
  fetchingLocal: Signal<boolean>;
  fetchingRemote: Signal<boolean>;
  results: Signal<Unalias<ClientFetchResult<Q>> | undefined>;
  error: Signal<any>;
};

type QueryParams<
  M extends Models<any, any> | undefined,
  Q extends ClientQuery<M, any, any, any>
> = () => {
  client: TriplitClient<any>;
  query: ClientQueryBuilder<Q>;
  options?: Partial<SubscriptionOptions>;
};

export function injectQuery<
  M extends Models<any, any> | undefined,
  Q extends ClientQuery<M, any, any, any>
>(
  // TODO: make add WorkerClient to type
  queryFn: QueryParams<M, Q>,
  injector?: Injector
): QueryResults<M, Q> {
  return assertInjector(injectQuery, injector, () => {
    return createBaseQuery(queryFn);
  });
}

function createBaseQuery<
  M extends Models<any, any> | undefined,
  Q extends ClientQuery<M, any, any, any>
>(queryFn: QueryParams<M, Q>): QueryResults<M, Q> {
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

  const resultSignal = signal<ClientFetchResult<Q> | undefined>(undefined);
  const fetchingLocalSignal = signal(true);
  const fetchingRemoteSignal = signal(
    queryParamsSignal().client.connectionStatus !== 'CLOSED'
  );
  const errorSignal = signal(undefined);
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
          // @ts-expect-error
          resultSignal.set(new Map(localResults));
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

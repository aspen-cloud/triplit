import {
  FetchResult,
  ClientQuery,
  ClientQueryBuilder,
  CollectionNameFromModels,
  Models,
  SubscriptionOptions,
  TriplitClient,
  Unalias,
} from '@triplit/client';
import { WorkerClient } from '@triplit/client/worker-client';
import {
  BehaviorSubject,
  combineLatest,
  from,
  Observable,
  map,
  distinctUntilChanged,
  switchMap,
  share,
  shareReplay,
} from 'rxjs';

export function createQuery<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  Q extends ClientQuery<M, CN>
>(
  queryFn: () => {
    client: TriplitClient<any>;
    query: ClientQueryBuilder<M, CN, Q>;
    options?: Partial<SubscriptionOptions>;
  }
): {
  fetching$: Observable<boolean>;
  fetchingLocal$: Observable<boolean>;
  fetchingRemote$: Observable<boolean>;
  results$: Observable<Unalias<FetchResult<M, Q>> | undefined>;
  error$: Observable<any>;
} {
  const queryParams$ = new BehaviorSubject(queryFn());

  const fetchingLocalSubject = new BehaviorSubject<boolean>(true);
  const fetchingRemoteSubject = new BehaviorSubject<boolean>(
    queryFn().client.connectionStatus !== 'CLOSED'
  );
  const errorSubject = new BehaviorSubject<any>(undefined);
  const isInitialFetchSubject = new BehaviorSubject<boolean>(true);
  const hasResponseFromServerSubject = new BehaviorSubject<boolean>(false);

  const builtQuery$ = queryParams$.pipe(
    map((params) => params.query.build()),
    distinctUntilChanged()
  );

  builtQuery$
    .pipe(
      switchMap((builtQuery) => {
        const { client } = queryParams$.getValue();
        return from(client.isFirstTimeFetchingQuery(builtQuery));
      })
    )
    .subscribe((isFirstFetch) => {
      isInitialFetchSubject.next(isFirstFetch);
    });

  const results$ = queryParams$.pipe(
    switchMap((params) => {
      const { client, query, options } = params;
      return new Observable<FetchResult<M, Q>>((observer) => {
        fetchingLocalSubject.next(true);

        const unsubscribe = client.subscribe(
          query.build(),
          (localResults) => {
            fetchingLocalSubject.next(false);
            errorSubject.next(undefined);
            // Using 'as any' to bypass the type mismatch temporarily
            observer.next(localResults as any);
          },
          (error) => {
            fetchingLocalSubject.next(false);
            errorSubject.next(error);
            observer.error(error);
          },
          {
            ...(options ?? {}),
            onRemoteFulfilled: () => {
              hasResponseFromServerSubject.next(true);
              fetchingRemoteSubject.next(false);
            },
          }
        );
        return unsubscribe;
      });
    }),
    shareReplay({ refCount: true })
  );

  return {
    fetching$: combineLatest([
      fetchingLocalSubject,
      isInitialFetchSubject,
      fetchingRemoteSubject,
    ]).pipe(
      map(
        ([fetchingLocal, isInitialFetch, fetchingRemote]) =>
          fetchingLocal || (isInitialFetch && fetchingRemote)
      )
    ),
    fetchingLocal$: fetchingLocalSubject.asObservable(),
    fetchingRemote$: fetchingRemoteSubject.asObservable(),
    // @ts-ignore
    results$,
    error$: errorSubject.asObservable(),
  };
}

type createPaginatedQueryPayload<M extends Models, Q extends ClientQuery<M>> = {
  results$: Observable<Unalias<FetchResult<M, Q>> | undefined>;
  fetching$: Observable<boolean>;
  fetchingPage$: Observable<boolean>;
  error$: Observable<any>;
  hasNextPage$: Observable<boolean>;
  hasPreviousPage$: Observable<boolean>;
  nextPage: () => void;
  prevPage: () => void;
  disconnect: () => void;
};

export function createPaginatedQuery<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  Q extends ClientQuery<M, CN>
>(
  queryFn: () => {
    client: TriplitClient<any> | WorkerClient<any>;
    query: ClientQueryBuilder<M, CN, Q>;
    options?: Partial<SubscriptionOptions>;
  }
): createPaginatedQueryPayload<M, Q> {
  const queryParams$ = new BehaviorSubject(queryFn());
  const fetchingSubject = new BehaviorSubject<boolean>(true);
  const errorSubject = new BehaviorSubject<any>(undefined);
  const hasNextPageSubject = new BehaviorSubject<boolean>(false);
  const hasPreviousPageSubject = new BehaviorSubject<boolean>(false);
  const nextPageSubject = new BehaviorSubject<() => void>(() => {});
  const prevPageSubject = new BehaviorSubject<() => void>(() => {});
  const fetchingPageSubject = new BehaviorSubject<boolean>(false);

  const results$ = queryParams$.pipe(
    switchMap((params) => {
      const { client, query, options } = params;
      return new Observable<FetchResult<M, Q>>((observer) => {
        fetchingSubject.next(true);

        const subscription = client.subscribeWithPagination(
          query.build(),
          (localResults, info) => {
            fetchingSubject.next(false);
            fetchingPageSubject.next(false);
            hasNextPageSubject.next(info.hasNextPage);
            hasPreviousPageSubject.next(info.hasPreviousPage);
            errorSubject.next(undefined);
            // Using 'as any' to bypass the type mismatch temporarily
            observer.next(localResults as any);
          },
          (error) => {
            fetchingSubject.next(false);
            fetchingPageSubject.next(false);
            errorSubject.next(error);
            observer.error(error);
          },
          options
        );
        nextPageSubject.next(() => {
          fetchingPageSubject.next(true);
          subscription.nextPage();
        });
        prevPageSubject.next(() => {
          fetchingPageSubject.next(true);
          subscription.prevPage();
        });
        return subscription.unsubscribe;
      });
    }),
    shareReplay({ refCount: true })
  );

  return {
    fetchingRemote$: fetchingSubject.asObservable(),
    fetchingPage$: fetchingPageSubject.asObservable(),
    hasNextPage$: hasNextPageSubject.asObservable(),
    hasPreviousPage$: hasPreviousPageSubject.asObservable(),
    nextPage: () => nextPageSubject.getValue()(),
    prevPage: () => prevPageSubject.getValue()(),
    // @ts-ignore
    results$,
    error$: errorSubject.asObservable(),
  };
}

type createInfiniteQueryPayload<M extends Models, Q extends ClientQuery<M>> = {
  results$: Observable<Unalias<FetchResult<M, Q>> | undefined>;
  fetching$: Observable<boolean>;
  fetchingMore$: Observable<boolean>;
  error$: Observable<any>;
  hasMore$: Observable<boolean>;
  loadMore: () => void;
};

export function createInfiniteQuery<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  Q extends ClientQuery<M>
>(
  queryFn: () => {
    client: TriplitClient<M> | WorkerClient<M>;
    query: ClientQueryBuilder<M, CN, Q>;
    options?: Partial<SubscriptionOptions>;
  }
): createInfiniteQueryPayload<M, Q> {
  const queryParams$ = new BehaviorSubject(queryFn());
  const fetchingSubject = new BehaviorSubject<boolean>(true);
  const fetchingMoreSubject = new BehaviorSubject<boolean>(false);
  const hasMoreSubject = new BehaviorSubject<boolean>(false);
  const loadMoreSubject = new BehaviorSubject<() => void>(() => {});
  const errorSubject = new BehaviorSubject<any>(undefined);

  const results$ = queryParams$.pipe(
    switchMap((params) => {
      const { client, query, options } = params;

      return new Observable<FetchResult<M, Q>>((observer) => {
        fetchingSubject.next(true);

        const subscription = client.subscribeWithExpand(
          query.build(),
          (localResults, info) => {
            fetchingSubject.next(false);
            fetchingMoreSubject.next(false);
            hasMoreSubject.next(info.hasMore);
            errorSubject.next(undefined);
            // Using 'as any' to bypass the type mismatch temporarily
            observer.next(localResults as any);
          },
          (error) => {
            fetchingSubject.next(false);
            fetchingMoreSubject.next(false);
            errorSubject.next(error);
            observer.error(error);
          },
          options
        );
        loadMoreSubject.next(() => {
          subscription.loadMore();
          fetchingMoreSubject.next(true);
        });
        return subscription.unsubscribe;
      });
    }),
    shareReplay({ refCount: true })
  );

  return {
    fetching$: fetchingSubject.asObservable(),
    fetchingMore$$: fetchingMoreSubject.asObservable(),
    hasMore$: hasMoreSubject.asObservable(),
    loadMore: () => loadMoreSubject.getValue()(),
    // @ts-ignore
    results$,
    error$: errorSubject.asObservable(),
  };
}

import {
  FetchResult,
  Models,
  SubscriptionOptions,
  TriplitClient,
  SchemaQuery,
  SubscriptionSignalPayload,
} from '@triplit/client';
import { WorkerClient } from '@triplit/client/worker-client';
import { BehaviorSubject, Observable, switchMap, shareReplay } from 'rxjs';

type WrapObservable<T> = {
  [K in keyof T & string as `${K}$`]: Observable<T[K]>;
};

export function createQuery<M extends Models<M>, Q extends SchemaQuery<M>>(
  queryFn: () => {
    client: TriplitClient<M> | WorkerClient<M>;
    query: Q;
    options?: Partial<SubscriptionOptions>;
  }
): WrapObservable<SubscriptionSignalPayload<M, Q>> {
  const queryParams$ = new BehaviorSubject(queryFn());

  const fetchingLocalSubject = new BehaviorSubject<boolean>(true);
  const fetchingRemoteSubject = new BehaviorSubject<boolean>(false);
  const fetchingSubject = new BehaviorSubject<boolean>(true);
  const errorSubject = new BehaviorSubject<any>(undefined);

  const results$ = queryParams$.pipe(
    switchMap((params) => {
      const { client, query, options } = params;
      fetchingLocalSubject.next(true);
      fetchingRemoteSubject.next(false);
      fetchingSubject.next(true);
      errorSubject.next(undefined);
      return new Observable<SubscriptionSignalPayload<M, Q>['results']>(
        (observer) => {
          const unsubscribe = client.subscribeWithStatus(
            query,
            (state) => {
              fetchingLocalSubject.next(state.fetchingLocal);
              fetchingRemoteSubject.next(state.fetchingRemote);
              fetchingSubject.next(state.fetching);
              errorSubject.next(state.error);
              observer.next(state.results);
            },
            options
          );
          return unsubscribe;
        }
      );
    }),
    shareReplay({ refCount: true })
  );

  return {
    fetching$: fetchingSubject.asObservable(),
    fetchingLocal$: fetchingLocalSubject.asObservable(),
    fetchingRemote$: fetchingRemoteSubject.asObservable(),
    results$,
    error$: errorSubject.asObservable(),
  };
}

type createPaginatedQueryPayload<
  M extends Models<M>,
  Q extends SchemaQuery<M>,
> = {
  results$: Observable<FetchResult<M, Q, 'many'> | undefined>;
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
  M extends Models<M>,
  Q extends SchemaQuery<M>,
>(
  queryFn: () => {
    client: TriplitClient<M> | WorkerClient<M>;
    query: Q;
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
  const disconnectSubject = new BehaviorSubject<() => void>(() => {});
  const fetchingPageSubject = new BehaviorSubject<boolean>(false);

  const results$ = queryParams$.pipe(
    switchMap((params) => {
      const { client, query, options } = params;
      return new Observable<FetchResult<M, Q, 'many'>>((observer) => {
        fetchingSubject.next(true);

        const subscription = client.subscribeWithPagination(
          query,
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
        disconnectSubject.next(() => subscription.unsubscribe());
        return subscription.unsubscribe;
      });
    }),
    shareReplay({ refCount: true })
  );

  return {
    fetching$: fetchingSubject.asObservable(),
    fetchingPage$: fetchingPageSubject.asObservable(),
    hasNextPage$: hasNextPageSubject.asObservable(),
    hasPreviousPage$: hasPreviousPageSubject.asObservable(),
    nextPage: () => nextPageSubject.getValue()(),
    prevPage: () => prevPageSubject.getValue()(),
    disconnect: () => disconnectSubject.getValue()(),
    // @ts-ignore
    results$,
    error$: errorSubject.asObservable(),
  };
}

type createInfiniteQueryPayload<
  M extends Models<M>,
  Q extends SchemaQuery<M>,
> = {
  results$: Observable<FetchResult<M, Q, 'many'> | undefined>;
  fetching$: Observable<boolean>;
  fetchingMore$: Observable<boolean>;
  error$: Observable<any>;
  hasMore$: Observable<boolean>;
  loadMore: (pageSize?: number) => void;
  disconnect: () => void;
};

export function createInfiniteQuery<
  M extends Models<M>,
  Q extends SchemaQuery<M>,
>(
  queryFn: () => {
    client: TriplitClient<M> | WorkerClient<M>;
    query: Q;
    options?: Partial<SubscriptionOptions>;
  }
): createInfiniteQueryPayload<M, Q> {
  const queryParams$ = new BehaviorSubject(queryFn());
  const fetchingSubject = new BehaviorSubject<boolean>(true);
  const fetchingMoreSubject = new BehaviorSubject<boolean>(false);
  const hasMoreSubject = new BehaviorSubject<boolean>(false);
  const loadMoreSubject = new BehaviorSubject<(pageSize?: number) => void>(
    () => {}
  );
  const disconnectSubject = new BehaviorSubject<() => void>(() => {});
  const errorSubject = new BehaviorSubject<any>(undefined);

  const results$ = queryParams$.pipe(
    switchMap((params) => {
      const { client, query, options } = params;

      return new Observable<FetchResult<M, Q, 'many'>>((observer) => {
        fetchingSubject.next(true);

        const subscription = client.subscribeWithExpand(
          query,
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
        loadMoreSubject.next((pageSize?: number) => {
          subscription.loadMore(pageSize);
          fetchingMoreSubject.next(true);
        });
        disconnectSubject.next(() => subscription.unsubscribe());
        return subscription.unsubscribe;
      });
    }),
    shareReplay({ refCount: true })
  );

  return {
    fetching$: fetchingSubject.asObservable(),
    fetchingMore$: fetchingMoreSubject.asObservable(),
    hasMore$: hasMoreSubject.asObservable(),
    loadMore: (pageSize?: number) => loadMoreSubject.getValue()(pageSize),
    disconnect: () => disconnectSubject.getValue()(),
    // @ts-ignore
    results$,
    error$: errorSubject.asObservable(),
  };
}

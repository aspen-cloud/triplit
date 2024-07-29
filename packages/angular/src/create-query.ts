import type {
  ClientFetchResult,
  ClientQuery,
  ClientQueryBuilder,
  Models,
  SubscriptionOptions,
  TriplitClient,
  Unalias,
} from '@triplit/client';
import {
  BehaviorSubject,
  combineLatest,
  from,
  Observable,
  map,
  distinctUntilChanged,
  switchMap,
} from 'rxjs';

export function createQuery<
  M extends Models<any, any> | undefined,
  Q extends ClientQuery<M, any, any, any>
>(
  queryFn: () => {
    client: TriplitClient<any>;
    query: ClientQueryBuilder<Q>;
    options?: Partial<SubscriptionOptions>;
  }
): {
  fetching$: Observable<boolean>;
  fetchingLocal$: Observable<boolean>;
  fetchingRemote$: Observable<boolean>;
  results$: Observable<Unalias<ClientFetchResult<Q>> | undefined>;
  error$: Observable<any>;
} {
  const queryParams$ = new BehaviorSubject(queryFn());
  const resultSubject = new BehaviorSubject<ClientFetchResult<Q> | undefined>(
    undefined
  );
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

  queryParams$
    .pipe(
      switchMap((params) => {
        const { client, query, options } = params;
        return new Observable<ClientFetchResult<Q>>((observer) => {
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
          return () => unsubscribe();
        });
      })
    )
    .subscribe(resultSubject);

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
    results$: resultSubject.asObservable(),
    error$: errorSubject.asObservable(),
  };
}

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
        return () => {
          unsubscribe();
        };
      });
    })
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

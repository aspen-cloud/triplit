import {
  AnyContext,
  AnyRoute,
  createFileRoute,
  FileRoutesByPath,
  LoaderFnContext,
  ResolveParams,
  RouteConstraints,
  useLoaderData,
} from '@tanstack/react-router';
import {
  ClientFetchResult,
  ClientQuery,
  ClientSchema,
  QueryResult,
  TriplitClient,
} from '@triplit/client';
import { useQuery } from '@triplit/react';
import { ComponentType, useCallback, useMemo, useState } from 'react';

export function triplitRoute<
  M extends ClientSchema,
  Q extends ClientQuery<M>,
  Path extends keyof FileRoutesByPath,
  TParentRoute extends AnyRoute = FileRoutesByPath[Path]['parentRoute'],
  TId extends RouteConstraints['TId'] = FileRoutesByPath[Path]['id'],
  TPath extends RouteConstraints['TPath'] = FileRoutesByPath[Path]['path'],
  TFullPath extends
    RouteConstraints['TFullPath'] = FileRoutesByPath[Path]['fullPath'],
>(
  client: TriplitClient<M>,
  query:
    | Q
    | ((
        loaderParams: LoaderFnContext<
          TParentRoute,
          ResolveParams<Path>,
          unknown,
          unknown,
          unknown,
          unknown
        >
      ) => Q),
  Component: ComponentType<{
    results: QueryResult<M, Q>[];
    error: any;
    updateQuery: (newQuery: Q) => void;
  }>
): Parameters<
  ReturnType<typeof createFileRoute<Path, TParentRoute, TId, TPath, TFullPath>>
>[0] {
  return {
    loader: async <
      Ctx extends LoaderFnContext<
        TParentRoute,
        unknown,
        ResolveParams<Path>,
        AnyContext,
        unknown,
        unknown
      >,
    >(
      ctx: Ctx
    ): Promise<{
      results: ClientFetchResult<M, Q>;
      query: Q;
    }> => {
      const fullQuery: Q =
        typeof query === 'function' ? query(ctx as any) : query;
      const results = (await client.fetch(fullQuery)) as ClientFetchResult<
        M,
        Q
      >;
      return {
        results,
        query: fullQuery,
      };
    },
    component: function TriplitRoute() {
      const { results: initialResults, query } = useLoaderData({
        strict: false,
      });
      const [latestQuery, setQuery] = useState<Q>(query);
      const updateQuery = useCallback((newQuery: Q) => {
        setQuery(newQuery);
      }, []);
      const resp = useQuery(client, latestQuery);
      const results = useMemo(() => {
        const latestResults = resp.results ?? initialResults;
        return latestResults ?? [];
      }, [initialResults, resp?.results]);
      return (
        <Component
          results={results}
          error={resp.error}
          updateQuery={updateQuery}
        />
      );
    },
    // Turn off caching to prevent stale local results
    // https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#using-shouldreload-and-gctime-to-opt-out-of-caching
    // Do not cache this route's data after it's unloaded
    gcTime: 0,
    // Only reload the route when the user navigates to it or when deps change
    shouldReload: false,
  };
}

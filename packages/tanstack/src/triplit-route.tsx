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
import { ComponentType, useMemo } from 'react';

export function triplitRoute<
  M extends ClientSchema,
  Q extends ClientQuery<M>,
  Path extends keyof FileRoutesByPath,
  TParentRoute extends AnyRoute = FileRoutesByPath[Path]['parentRoute'],
  TId extends RouteConstraints['TId'] = FileRoutesByPath[Path]['id'],
  TPath extends RouteConstraints['TPath'] = FileRoutesByPath[Path]['path'],
  TFullPath extends RouteConstraints['TFullPath'] = FileRoutesByPath[Path]['fullPath']
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
  Component: ComponentType<{ results: QueryResult<M, Q>[] }>
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
      >
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
      const resp = useQuery(client, query);
      const results = useMemo(() => {
        const latestResults = resp.results ?? initialResults;
        return [...(latestResults?.values() ?? [])];
      }, [initialResults, resp?.results]);
      return <Component results={results} />;
    },
  };
}

import { Schema } from '@triplit/db';
import { TriplitClient } from '@triplit/client';
import { useCallback, useEffect, useMemo } from 'react';
import { CaretDown, GridFour, Selection } from '@phosphor-icons/react';
import { DataViewer, FullScreenWrapper, Project } from '.';
import { Button } from '@triplit/ui';
import { ProjectOptionsMenu } from './project-options-menu';
import { useConnectionStatus, useEntity } from '@triplit/react';
import { CreateCollectionDialog } from './create-collection-dialog';
import { CollectionStats, fetchCollectionStats } from '../utils/server';
import { useLoaderData, redirect } from 'react-router-dom';
import { consoleClient } from 'triplit/client.js';
import { DEFAULT_HOSTNAME, initializeFromUrl } from 'src/utils/project.js';
import { ModeToggle } from './mode-toggle.js';
import useUrlState from '@ahooksjs/use-url-state';
import { QueryOrder, QueryWhere } from '@triplit/db/src/query.js';

const projectClients = new Map<string, TriplitClient<any>>();

const initFromUrlPromise = initializeFromUrl();

export async function loader({ params }: { params: { projectId?: string } }) {
  const { projectId: slugProjectId } = params;
  const importedProjectId = await initFromUrlPromise;
  const projectId =
    slugProjectId === 'local' ? DEFAULT_HOSTNAME : importedProjectId;
  if (!projectId) return redirect('/');
  const project = await consoleClient.fetchById('projects', projectId);
  if (!project) return redirect('/');
  const collectionStats = await fetchCollectionStats(project);
  const savedClient = projectClients.get(projectId);
  if (savedClient) {
    return { client: savedClient, project, collectionStats };
  }

  const { secure, server, token } = project;

  const client = new TriplitClient({
    serverUrl: `${secure ? 'https' : 'http'}://${server}`,
    token,
    syncSchema: true,
    autoConnect: false,
  });
  projectClients.set(projectId, client);
  return { client, project, collectionStats };
}

export type ConsoleQuery = {
  collection: string;
  where: QueryWhere<any, any>;
  order: QueryOrder<any, any>;
};

export type SetConsoleQuery = (newQuery: Partial<ConsoleQuery>) => void;

export function ProjectViewerPage() {
  const { client, collectionStats, project } = useLoaderData() as {
    client: TriplitClient<any>;
    project: Project;
    collectionStats: CollectionStats[];
  };

  const [urlQueryState, setUrlQueryState] = useUrlState({
    collection: undefined,
    where: undefined,
    order: undefined,
  });

  const query: ConsoleQuery = useMemo(
    () => ({
      collection: urlQueryState.collection,
      where: JSON.parse(urlQueryState.where ?? '[]'),
      order: JSON.parse(urlQueryState.order ?? '[]'),
    }),
    [urlQueryState]
  );

  const setQuery: SetConsoleQuery = useCallback(
    (newQuery) => {
      const newState = { ...query, ...newQuery };
      for (const [key, val] of Object.entries(newState)) {
        if (val !== undefined && typeof val !== 'string')
          // @ts-expect-error
          newState[key as keyof ConsoleQuery] = JSON.stringify(
            newState[key as keyof ConsoleQuery]
          );
      }
      setUrlQueryState(newState);
    },
    [query, setUrlQueryState]
  );
  return (
    <ProjectViewer
      client={client}
      collectionStats={collectionStats}
      project={project}
      query={query}
      setQuery={setQuery}
    />
  );
}

export function ProjectViewer({
  client,
  collectionStats,
  project,
  query,
  setQuery,
}: {
  client: TriplitClient<any>;
  collectionStats: CollectionStats[];
  project?: Project;
  query: ConsoleQuery;
  setQuery: SetConsoleQuery;
}) {
  const connectionStatus = useConnectionStatus(client);
  useEffect(() => {
    client?.syncEngine.connect();
    return () => {
      client?.syncEngine.disconnect();
    };
  }, [client]);

  window.appClient = client;
  const {
    result: schema,
    fetching: fetchingSchema,
    fetchingRemote: schemaFetchingRemote,
  } = useEntity(client, '_metadata', '_schema');

  const collectionsTolist = schema
    ? Object.keys(schema.collections)
    : collectionStats.map(({ collection }) => collection);

  const statsByCollection = useMemo(() => {
    return collectionStats.reduce((acc, { collection, numEntities }) => {
      acc[collection] = { numEntities };
      return acc;
    }, {} as Record<string, { numEntities: number }>);
  }, [collectionStats]);

  const selectedCollectionStats = statsByCollection[query.collection];

  // if loading render loading state
  if (!client) return <FullScreenWrapper>Loading...</FullScreenWrapper>;
  const shouldEnableCreateCollectionButton =
    schema || collectionsTolist.length === 0;
  // If client, render hooks that rely on client safely
  return (
    <div className="flex bg-popover max-w-[100vw] overflow-hidden">
      <div className=" border-r h-screen flex flex-col p-4 w-[250px] shrink-0 overflow-y-auto">
        {project && (
          <ProjectOptionsMenu>
            <Button variant="secondary" className="w-full h-[2.5rem] mb-4">
              <div className="font-bold truncate">{project?.displayName}</div>
              <CaretDown className="ml-2 shrink-0" />
            </Button>
          </ProjectOptionsMenu>
        )}
        <div className="flex flex-row items-center justify-between gap-2 md:gap-4 mb-4">
          <span className="truncate text-sm md:text-lg font-semibold">
            Collections
          </span>
          <CreateCollectionDialog
            disabled={!shouldEnableCreateCollectionButton}
            onSubmit={async (collectionName) => {
              try {
                await client.db.createCollection({
                  name: collectionName,
                  schema: { id: Schema.Id().toJSON() },
                });
                setQuery({ collection: collectionName });
              } catch (e) {
                console.error(e);
              }
            }}
          />
        </div>
        {!fetchingSchema &&
          connectionStatus !== 'CONNECTING' &&
          collectionsTolist.map((collection) => (
            <Button
              key={collection}
              onClick={() => {
                setQuery({ collection });
              }}
              variant={query.collection === collection ? 'default' : 'ghost'}
              className={`truncate flex h-auto px-2 py-1 flex-row items-center gap-2 justify-start shrink-0`}
            >
              <GridFour
                weight="light"
                className="shrink-0 hidden md:inline-block"
                size={24}
              />
              <span className="text-xs md:text-sm truncate">{`${collection}`}</span>
            </Button>
          ))}
        {!fetchingSchema &&
          connectionStatus !== 'CONNECTING' &&
          collectionsTolist.length === 0 && (
            <div className="text-xs">
              {
                'Looks like you haven’t added any data yet. Once there is data saved in your Triplit instance, your collections will show up here.'
              }
            </div>
          )}
        <div className="grow" />
        <ModeToggle className="" />
      </div>
      <div className="flex-grow flex flex-col min-w-0">
        {!fetchingSchema && query.collection ? (
          <DataViewer
            key={query.collection}
            client={client}
            schema={schema}
            stats={selectedCollectionStats}
            query={query}
            setQuery={setQuery}
          />
        ) : (
          <div className="flex flex-col h-full justify-center items-center gap-6">
            <Selection size={80} weight="thin" />
            No collection selected
          </div>
        )}
      </div>
    </div>
  );
}

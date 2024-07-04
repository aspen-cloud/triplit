import '../../../ui/globals.css';

import { OrderStatement, Schema, QueryWhere } from '@triplit/db';
import { TriplitClient } from '@triplit/client';
import { useCallback, useEffect, useMemo } from 'react';
import { CaretDown, GridFour, Selection } from '@phosphor-icons/react';
import { DataViewer, FullScreenWrapper, Project } from '.';
import { Button, cn } from '@triplit/ui';
import { ProjectOptionsMenu } from './project-options-menu';
import { useConnectionStatus, useEntity } from '@triplit/react';
import { CreateCollectionDialog } from './create-collection-dialog';
import { CollectionStats, fetchCollectionStats } from '../utils/server';
import { useLoaderData, redirect, useSearchParams } from 'react-router-dom';
import { consoleClient } from 'triplit/client.js';
import { DEFAULT_HOSTNAME, initializeFromUrl } from 'src/utils/project.js';
import { ModeToggle } from '@triplit/ui';
import { createCollection } from 'src/utils/schema.js';
import { useToast } from 'src/hooks/useToast.js';
import { Toaster } from './toaster.js';

const projectClients = new Map<string, TriplitClient<any>>();

const initFromUrlPromise = initializeFromUrl();

export async function loader({ params }: { params: { projectId?: string } }) {
  const { projectId: slugProjectId } = params;
  const importedProjectId = await initFromUrlPromise;
  const projectId =
    slugProjectId === 'local'
      ? DEFAULT_HOSTNAME
      : importedProjectId ?? slugProjectId;
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
  collection?: string | null;
  where?: QueryWhere<any, any> | null;
  order?: OrderStatement<any, any> | null;
  server?: string | null;
  token?: string | null;
  projName?: string | null;
};

export type SetConsoleQuery = (
  newQuery: Partial<ConsoleQuery>,
  merge?: boolean
) => void;

export function ProjectViewerPage() {
  const { client, collectionStats, project } = useLoaderData() as {
    client: TriplitClient<any>;
    project: Project;
    collectionStats: CollectionStats[];
  };

  const [urlQueryState, setUrlQueryState] = useSearchParams();

  const query: ConsoleQuery = useMemo(
    () => ({
      collection: urlQueryState.get('collection'),
      where: JSON.parse(urlQueryState.get('where') ?? '[]'),
      order: JSON.parse(urlQueryState.get('order') ?? '[]'),
      server: urlQueryState.get('server'),
      token: urlQueryState.get('token'),
      projName: urlQueryState.get('projName'),
    }),
    [urlQueryState]
  );

  const setQuery: SetConsoleQuery = useCallback(
    (newQuery, merge = true) => {
      if (!merge) {
        const { server, token, projName } = query;
        setUrlQueryState({ server, token, projName, ...newQuery });
        return;
      }
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
    <div className="w-screen h-screen overflow-hidden">
      <ProjectViewer
        client={client}
        collectionStats={collectionStats}
        project={project}
        query={query}
        setQuery={setQuery}
      />
    </div>
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
  const { toast } = useToast();
  const connectionStatus = useConnectionStatus(client);
  useEffect(() => {
    client?.syncEngine.connect();
    return () => {
      client?.syncEngine.disconnect();
    };
  }, [client]);

  if (typeof window !== 'undefined') window.appClient = client;
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
    <div className="flex bg-popover w-full overflow-hidden h-full">
      <Toaster />
      <div className=" border-r flex flex-col p-4 w-[250px] shrink-0 overflow-y-auto">
        {project && (
          <ProjectOptionsMenu>
            <Button variant="secondary" className="w-full h-[2.5rem] mb-4">
              <div className="font-bold truncate">{project?.displayName}</div>
              <CaretDown className="ml-2 shrink-0" />
            </Button>
          </ProjectOptionsMenu>
        )}
        <div
          className={cn(
            'text-xs py-1 px-2 w-max rounded transition-all',
            connectionStatus === 'OPEN'
              ? 'bg-green-200 text-green-700 dark:bg-green-950 dark:text-green-400 scale-100 mb-2'
              : 'bg-yellow-200 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-400 animate-pulse scale-125 mb-3'
          )}
        >
          {connectionStatus === 'OPEN' ? 'Connected' : 'Connecting'}
        </div>
        <div className="flex flex-row items-center justify-between gap-2 md:gap-4 mb-4">
          <span className="truncate text-sm md:text-lg font-semibold">
            Collections
          </span>
          <CreateCollectionDialog
            disabled={!shouldEnableCreateCollectionButton}
            onSubmit={async (collectionName) => {
              try {
                const error = await createCollection(client, collectionName, {
                  id: Schema.Id().toJSON(),
                });
                if (error) {
                  toast({
                    title: 'Error',
                    description: error,
                    variant: 'destructive',
                  });
                  return;
                }
                setQuery({ collection: collectionName }, false);
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
                setQuery({ collection }, false);
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
            <p className="text-xs">
              {
                'Looks like you haven’t added any data yet. Once there is data saved in your Triplit instance, your collections will show up here.'
              }
            </p>
          )}
        {project && (
          <>
            <div className="grow" />
            <ModeToggle className="" />
          </>
        )}
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

import { Schema } from '@triplit/db';
import { TriplitClient } from '@triplit/client';
import { useEffect, useMemo } from 'react';
import { CaretDown, GridFour, Selection } from '@phosphor-icons/react';
import { DataViewer, FullScreenWrapper, Project } from '.';
import { Button } from '@triplit/ui';
import { ProjectOptionsMenu } from './project-options-menu';
import { useConnectionStatus, useEntity } from '@triplit/react';
import { CreateCollectionDialog } from './create-collection-dialog';
import { CollectionStats, fetchCollectionStats } from '../utils/server';
import { useSelectedCollection } from '../hooks/useSelectedCollection';
import { useLoaderData, redirect } from 'react-router-dom';
import { consoleClient } from 'triplit/client.js';
import { initializeFromUrl } from 'src/utils/project.js';

const projectClients = new Map<string, TriplitClient<any>>();

const initFromUrlPromise = initializeFromUrl();

export async function loader(slugProjectId?: string) {
  const importedProjectId = await initFromUrlPromise;
  const projectId = slugProjectId ?? importedProjectId;
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

export function ProjectViewer() {
  const { client, project, collectionStats } = useLoaderData() as {
    client: TriplitClient<any>;
    project: Project;
    collectionStats: CollectionStats[];
  };
  const connectionStatus = useConnectionStatus(client);
  useEffect(() => {
    client?.syncEngine.connect();
    return () => {
      client?.syncEngine.disconnect();
    };
  }, [client]);

  window.appClient = client;
  const [selectedCollection, setSelectedCollection] = useSelectedCollection();
  const {
    results: schema,
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

  // if loading render loading state
  if (!client) return <FullScreenWrapper>Loading...</FullScreenWrapper>;
  const shouldEnableCreateCollectionButton =
    schema || collectionsTolist.length === 0;
  // If client, render hooks that rely on client safely
  return (
    <div className="flex bg-popover max-w-[100vw] overflow-hidden">
      <div className=" border-r h-screen flex flex-col p-4 w-[250px] shrink-0 overflow-y-auto">
        <ProjectOptionsMenu>
          <Button variant="secondary" className="w-full h-[2.5rem]">
            <div className="font-bold truncate">{project?.displayName}</div>
            <CaretDown className="ml-2 shrink-0" />
          </Button>
        </ProjectOptionsMenu>
        <div className="flex flex-row items-center justify-between gap-2 md:gap-4 my-4">
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
                setSelectedCollection(collectionName);
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
                setSelectedCollection(collection);
              }}
              variant={selectedCollection === collection ? 'default' : 'ghost'}
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
      </div>
      <div className="flex-grow flex flex-col min-w-0">
        {selectedCollection && !fetchingSchema ? (
          <DataViewer
            projectId={project.id}
            collection={selectedCollection}
            client={client}
            schema={schema}
            stats={statsByCollection[selectedCollection]}
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

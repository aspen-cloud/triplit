import { Schema } from '@triplit/db';
import { TriplitClient } from '@triplit/client';
import { useEffect, useState } from 'react';
import { CaretDown, GridFour, Selection } from '@phosphor-icons/react';
import { DataViewer, FullScreenWrapper, Project } from '.';
import { Button } from '@triplit/ui';
import { ProjectOptionsMenu } from './project-options-menu';
import { useEntity } from '@triplit/react';
import { CreateCollectionDialog } from './create-collection-dialog';
import { CollectionStats, fetchCollectionStats } from '../utils/server';
import { useSelectedCollection } from '../hooks/useSelectedCollection';

export function ProjectViewer({
  projectPrimaryKey,
  project,
  client,
}: {
  projectPrimaryKey: string;
  project: Project;
  client: TriplitClient<any>;
}) {
  // ProjectViewer.tsx - handles loading client and safely rendering children
  window.appClient = client;
  const [selectedCollection, setSelectedCollection] = useSelectedCollection();
  const [collectionStats, setCollectionStats] = useState<CollectionStats[]>([]);
  const { results: schema } = useEntity(client, '_metadata', '_schema');
  useEffect(() => {
    (async () => {
      setCollectionStats(await fetchCollectionStats(project));
    })();
  }, [project]);

  const collectionsTolist = schema
    ? Object.keys(schema.collections)
    : collectionStats.map(({ collection }) => collection);
  // if loading render loading state
  if (!client) return <FullScreenWrapper>Loading...</FullScreenWrapper>;
  const shouldShowCreateCollectionButton =
    schema || collectionsTolist.length === 0;
  // If client, render hooks that rely on client safely
  return (
    <div className="grid grid-cols-6 bg-popover">
      <div className=" border-r col-span-1 h-screen flex flex-col p-4 ">
        <ProjectOptionsMenu>
          <Button variant="secondary" className="w-full">
            <div className="font-bold truncate ">{project?.displayName}</div>
            <CaretDown className="ml-2 shrink-0" />
          </Button>
        </ProjectOptionsMenu>
        <div className="flex flex-row items-cente justify-between my-4">
          <span className="truncate text-sm md:text-lg font-semibold">
            Collections
          </span>
          {shouldShowCreateCollectionButton && (
            <CreateCollectionDialog
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
          )}
        </div>
        {collectionsTolist.map((collection) => (
          <Button
            key={collection}
            onClick={() => {
              setSelectedCollection(collection);
            }}
            variant={selectedCollection === collection ? 'default' : 'ghost'}
            className={`truncate flex h-auto px-2 py-1 flex-row items-center gap-2 justify-start`}
          >
            <GridFour weight="light" className="shrink-0" size={24} />
            <span className="text-xs md:text-sm truncate">{`${collection}`}</span>
          </Button>
        ))}
        {collectionsTolist.length === 0 && (
          <div className="text-xs">
            {
              'Looks like you haven’t added any data yet. Once there is data saved in your Triplit instance, your collections will show up here.'
            }
          </div>
        )}
      </div>
      <div className="col-span-5 flex flex-col">
        {selectedCollection ? (
          <DataViewer
            projectId={projectPrimaryKey}
            collection={selectedCollection}
            client={client}
            schema={schema}
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

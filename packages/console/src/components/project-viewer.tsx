import { TriplitClient } from '@triplit/client';
import { useEffect, useMemo, useState } from 'react';
import { CaretDown, GridFour, Selection } from '@phosphor-icons/react';
import '@glideapps/glide-data-grid/dist/index.css';
import {
  CollectionSchemaDetail,
  DataViewer,
  FullScreenWrapper,
  Project,
} from '.';
import { CloseButton } from '@/components/ui/close-button';
import { Button } from '@/components/ui/button';
import { ProjectOptionsMenu } from './project-options-menu';
import { useEntity } from '@triplit/react';
import { CreateCollectionDialog } from './create-collection-dialog';
import { CollectionMenu } from './collection-menu';
import { DeleteCollectionDialog } from './delete-collection-dialog';
import { fetchCollectionStats } from '../utils/server';
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

  const [selectedCollection, setSelectedCollection] = useSelectedCollection();
  const [deleteCollectionDialogOpen, setDeleteCollectionDialogOpen] =
    useState(false);

  // TODO: why does this break when you switch away from a project and back?
  const { results: schema } = useEntity(client, '_metadata', '_schema');
  const [collections, setCollections] = useState<string[]>([]);
  const [showSchemaEditor, setShowSchemaEditor] = useState(false);
  useEffect(() => {
    if (schema && schema.collections) {
      setCollections(Object.keys(schema.collections));
    } else {
      (async () => {
        setCollections(
          (await fetchCollectionStats(project)).map(
            ({ collection }) => collection
          )
        );
      })();
    }
  }, [schema, project]);
  useEffect(() => {
    if (selectedCollection && !collections.includes(selectedCollection))
      setSelectedCollection(undefined);
  }, [selectedCollection, collections]);

  // if loading render loading state
  if (!client) return <FullScreenWrapper>Loading...</FullScreenWrapper>;
  // If client, render hooks that rely on client safely
  return (
    <div className="grid grid-cols-6 bg-popover">
      <div className=" border-r col-span-1 h-screen flex flex-col p-3 gap-3 ">
        <ProjectOptionsMenu projectPrimaryKey={projectPrimaryKey}>
          <Button variant="secondary" className="w-full">
            <div className="font-bold truncate ">{project?.displayName}</div>
            <CaretDown className="ml-2 shrink-0" />
          </Button>
        </ProjectOptionsMenu>
        {schema && (
          <CreateCollectionDialog
            onSubmit={async (collectionName) => {
              try {
                await client.db.createCollection({
                  name: collectionName,
                  schema: {},
                });
                setSelectedCollection(collectionName);
              } catch (e) {
                console.error(e);
              }
            }}
          />
        )}
        {selectedCollection && (
          <DeleteCollectionDialog
            open={deleteCollectionDialogOpen}
            onOpenChange={setDeleteCollectionDialogOpen}
            collectionName={selectedCollection}
            projectName={project?.displayName}
            client={client}
          />
        )}
        <div>Collections</div>
        {collections.map((collection) => (
          <div
            key={collection}
            className={`truncate flex flex-row justify-between items-center text-muted-foreground cursor-pointer hover:underline ${
              selectedCollection === collection ? 'font-bold' : ''
            }`}
          >
            <div
              className="flex flex-row items-center gap-2"
              onClick={() => {
                setSelectedCollection(collection);
              }}
            >
              <GridFour weight="light" size={24} />
              {`${collection}`}
            </div>
            {schema && collection === selectedCollection && (
              <CollectionMenu
                onDelete={() => {
                  setDeleteCollectionDialogOpen(true);
                }}
              />
            )}
          </div>
        ))}
        {collections.length === 0 && (
          <div className="text-xs">
            {
              'Looks like you haven’t added any data yet. Once there is data saved in your Triplit instance, your collections will show up here.'
            }
          </div>
        )}
      </div>
      <div className="col-span-5 flex flex-col">
        {showSchemaEditor && selectedCollection && schema && (
          <div className="p-5">
            <div className="mb-4 flex flex-row justify-between">
              <div>
                {selectedCollection}
                <span className="text-zinc-500 ml-2">schema</span>
              </div>
              <CloseButton onClick={() => setShowSchemaEditor(false)} />
            </div>
            <CollectionSchemaDetail
              collectionSchema={schema.collections[selectedCollection]}
            />
          </div>
        )}
        {!showSchemaEditor && selectedCollection && (
          <DataViewer
            projectId={projectPrimaryKey}
            collection={selectedCollection}
            client={client}
            schema={schema}
            onPressEditSchema={() => schema && setShowSchemaEditor(true)}
          />
        )}
        {!selectedCollection && (
          <div className="flex flex-col h-full justify-center items-center gap-6">
            <Selection size={80} weight="thin" />
            No collection selected
          </div>
        )}
      </div>
    </div>
  );
}

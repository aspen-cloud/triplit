import { TriplitClient } from '@triplit/client';
import { useQuery } from '@triplit/react';
import { useMemo, useState, useCallback } from 'react';
import '@glideapps/glide-data-grid/dist/index.css';
import { CreateEntityForm, useProjectState } from '.';
import { consoleClient } from '../../triplit/client';
import { ColumnDef } from '@tanstack/react-table';
import {
  DataTable,
  DataCell,
  TriplitColumnHeader,
  RelationCell,
} from './data-table';
import { Button } from '@/components/ui/button';
import {
  SchemaAttributeSheet,
  addOrUpdateAttributeFormOpenAtom,
  attributeToUpdateAtom,
} from './schema-attribute-sheet';
import { ColumnMenu } from './column-menu';
import { DeleteAttributeDialog } from './delete-attribute-dialog';
import { atom, useAtom } from 'jotai';
import { FiltersPopover } from './filters-popover';
import { OrderPopover } from './order-popover';
import { Checkbox } from '../../@/components/ui/checkbox';
import { Tooltip } from '../../@/components/ui/tooltip-simple';
import { useSelectedCollection } from '../hooks/useSelectedCollection';
import { SchemaDefinition } from '../../../db/src/data-types/serialization';
import useUrlState from '@ahooksjs/use-url-state';
import { DeleteEntitiesDialog } from './delete-entities-dialog.js';
import { CollectionMenu } from './collection-menu.js';
import { DeleteCollectionDialog } from './delete-collection-dialog.js';

const deleteAttributeDialogIsOpenAtom = atom(false);

window.client = consoleClient;

async function onSelectEntity(
  entityId: string,
  collectionName: string,
  projectId: string
) {
  await consoleClient.insert('selections', {
    collectionName,
    projectId,
    id: entityId,
  });
}
async function onDeselectEntity(entityId: string) {
  await consoleClient.delete('selections', entityId);
}

async function onDeselectAllEntities(
  collectionName: string,
  projectId: string
) {
  await consoleClient.transact(async (tx) => {
    const selectedEntities = await consoleClient.fetch(
      consoleClient
        .query('selections')
        .where([
          ['collectionName', '=', collectionName],
          ['projectId', '=', projectId],
        ])
        .build()
    );
    await Promise.all(
      Array.from(selectedEntities.keys()).map((selectedEnt) =>
        tx.delete('selections', selectedEnt)
      )
    );
  });
}

async function onSelectAllEntities(
  entityIds: string[],
  collectionName: string,
  projectId: string
) {
  await consoleClient.transact(async (tx) => {
    await Promise.all(
      entityIds.map((entityId) =>
        tx.insert('selections', { collectionName, projectId, id: entityId })
      )
    );
  });
}

async function deleteAttribute(
  client: TriplitClient<any>,
  collectionName: string,
  attributeName: string
) {
  try {
    await client.db.dropAttribute({
      collection: collectionName,
      path: [attributeName],
    });
  } catch (e) {
    console.error(e);
  }
}

export function DataViewer({
  collection,
  client,
  schema,
  projectId,
}: {
  projectId: string;
  collection: string;
  client: TriplitClient<any>;
  schema?: SchemaDefinition;
}) {
  const [deleteCollectionDialogOpen, setDeleteCollectionDialogOpen] =
    useState(false);
  const [deleteAttributeDialogIsOpen, setDeleteAttributeDialogIsOpen] = useAtom(
    deleteAttributeDialogIsOpenAtom
  );
  const [addOrUpdateAttributeFormOpen, setAddOrUpdateAttributeFormOpen] =
    useAtom(addOrUpdateAttributeFormOpenAtom);
  const [_attributeToUpdate, setAttributeToUpdate] = useAtom(
    attributeToUpdateAtom
  );
  const [selectedAttribute, setSelectedAttribute] = useState<string>('');
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [selectedCollection, _setSelectedCollection] = useSelectedCollection();
  const [urlQueryState, setUrlQueryState] = useUrlState({
    where: undefined,
    order: undefined,
  });
  const { results: selectedEntities } = useQuery(
    consoleClient,
    consoleClient.query('selections').where([
      ['collectionName', '=', collection],
      ['projectId', '=', projectId],
    ])
  );
  const collectionSchema = schema?.collections?.[selectedCollection];
  const filters = JSON.parse(urlQueryState.where ?? '[]');
  const order = JSON.parse(urlQueryState.order ?? '[]');

  const { results: orderedAndFilteredResults } = useQuery(
    client,
    client
      .query(collection)
      .order(...order)
      .where(filters)
  );

  const { results: allResults } = useQuery(client, client.query(collection));
  const sortedAndFilteredEntities = useMemo(
    () => Array.from(orderedAndFilteredResults ?? []),
    [orderedAndFilteredResults]
  );

  const uniqueAttributes: Set<string> = useMemo(() => {
    const attributes = new Set<string>();
    // if we have a schema, use it
    if (collectionSchema) {
      // handle the case where we have a collection but no attributes
      return new Set(Object.keys(collectionSchema.schema.properties ?? {}));
    }
    if (!allResults) return attributes;
    // otherwise construct a set of all attributes from all entities
    allResults.forEach((data) => {
      Object.keys(data).forEach((key: string) => {
        if (!attributes.has(key) && key !== '_collection') {
          attributes.add(key);
        }
      });
    });

    return attributes;
  }, [allResults, collectionSchema]);

  const allVisibleEntitiesAreSelected = useMemo(() => {
    if (!selectedEntities || selectedEntities.size === 0) return false;
    const allVisibleEntities = new Set(
      sortedAndFilteredEntities.map(([id]) => id)
    );
    return Array.from(allVisibleEntities).every((id) =>
      selectedEntities.has(id)
    );
  }, [sortedAndFilteredEntities, selectedEntities]);

  const toggleSelectAllEntities = useCallback(() => {
    allVisibleEntitiesAreSelected
      ? onDeselectAllEntities(collection, projectId)
      : onSelectAllEntities(
          sortedAndFilteredEntities.map(([id]) => id),
          collection,
          projectId
        );
  }, [
    sortedAndFilteredEntities,
    collection,
    projectId,
    allVisibleEntitiesAreSelected,
  ]);

  const idColumn: ColumnDef<any> = useMemo(
    () => ({
      header: () => (
        <div className="flex flex-row items-center">
          <Tooltip label="Select all">
            <Checkbox
              className="ml-3 mr-1"
              checked={allVisibleEntitiesAreSelected}
              onCheckedChange={toggleSelectAllEntities}
            />
          </Tooltip>
          <TriplitColumnHeader attribute="id">
            {selectedEntities && selectedEntities.size > 0 && (
              <DeleteEntitiesDialog
                entityIds={[...selectedEntities.keys()]}
                collectionName={collection}
                client={client}
              />
            )}
          </TriplitColumnHeader>
        </div>
      ),
      cell: ({ row }) => {
        const entityId = row.getValue('id');
        return (
          <div className="flex flex-row items-center">
            <Checkbox
              className="ml-3 mr-1"
              checked={selectedEntities && selectedEntities.has(entityId)}
              onCheckedChange={(checked) => {
                checked
                  ? onSelectEntity(entityId, collection, projectId)
                  : onDeselectEntity(entityId);
              }}
            />
            <DataCell
              attribute="id"
              value={row.getValue('id')}
              entityId={row.getValue('id')}
            />
          </div>
        );
      },
      accessorKey: 'id',
    }),
    [
      allVisibleEntitiesAreSelected,
      collection,
      projectId,
      toggleSelectAllEntities,
      selectedEntities,
    ]
  );
  const dataColumns = useMemo(() => {
    const cols: ColumnDef<any>[] = [];
    Array.from(uniqueAttributes)
      .filter((attr) => attr !== 'id')
      .forEach((attr) => {
        const typeDef = collectionSchema?.schema?.properties?.[attr];
        const isQueryColumn = typeDef?.type === 'query';
        cols.push({
          cell: ({ row, column }) => {
            const cellKey = `${row.getValue('id')}_${column.id}`;
            if (isQueryColumn)
              return (
                <RelationCell
                  queryDef={typeDef}
                  onClickRelationLink={() => {
                    const where = typeDef?.query?.where;
                    const whereWithVariablesReplaced = where.map(
                      ([attribute, operator, value]) => {
                        if (typeof value === 'string' && value.startsWith('$'))
                          value = row.getValue(value.split('$')[1] as string);
                        return [attribute, operator, value];
                      }
                    );
                    setUrlQueryState({
                      where: JSON.stringify(whereWithVariablesReplaced),
                      collectionName: typeDef?.query?.collectionName,
                    });
                  }}
                />
              );
            return (
              <DataCell
                attributeDef={typeDef}
                selected={selectedCell === cellKey}
                onSelectCell={() => setSelectedCell(cellKey)}
                attribute={attr}
                collection={collection}
                entityId={row.getValue('id')}
                client={client}
                value={row.getValue(attr)}
              />
            );
          },
          header: ({ column }) => {
            return (
              <TriplitColumnHeader
                attribute={attr}
                attributeDef={typeDef}
                rightIcon={
                  typeDef && (
                    <ColumnMenu
                      onDelete={() => {
                        setDeleteAttributeDialogIsOpen(true);
                        setSelectedAttribute(attr);
                      }}
                      onEdit={() => {
                        setAddOrUpdateAttributeFormOpen(true);
                        setAttributeToUpdate({
                          name: attr,
                          ...collectionSchema?.schema?.properties?.[attr],
                        });
                      }}
                    />
                  )
                }
              />
            );
          },
          accessorKey: attr,
        });
      });
    return cols;
  }, [
    uniqueAttributes,
    collectionSchema,
    selectedCell,
    toggleSelectAllEntities,
    idColumn,
  ]);

  const columns = [idColumn, ...dataColumns];

  const flatFilteredEntities = useMemo(
    () => sortedAndFilteredEntities.map(([id, entity]) => ({ id, ...entity })),
    [sortedAndFilteredEntities]
  );
  return (
    <div className="flex flex-col w-full h-full">
      {collectionSchema && (
        <>
          <SchemaAttributeSheet
            open={addOrUpdateAttributeFormOpen}
            onOpenChange={setAddOrUpdateAttributeFormOpen}
            collectionName={collection}
            client={client}
            collectionSchema={collectionSchema}
          />

          <DeleteCollectionDialog
            open={deleteCollectionDialogOpen}
            onOpenChange={setDeleteCollectionDialogOpen}
            client={client}
          />
          <DeleteAttributeDialog
            collectionName={collection}
            attributeName={selectedAttribute}
            open={deleteAttributeDialogIsOpen}
            onOpenChange={(open) => {
              setDeleteAttributeDialogIsOpen(open);
              if (!open) setSelectedAttribute('');
            }}
            onSubmit={async () => {
              await deleteAttribute(client, collection, selectedAttribute);
              setDeleteAttributeDialogIsOpen(false);
            }}
          />
        </>
      )}
      <h3 className="px-5 mt-5 text-2xl font-semibold tracking-tight flex flex-row gap-2">
        {collection}
        {schema && (
          <CollectionMenu
            onDelete={() => {
              setDeleteCollectionDialogOpen(true);
            }}
            onAddAttribute={() => {
              setAddOrUpdateAttributeFormOpen(true);
              setAttributeToUpdate(null);
            }}
          />
        )}
      </h3>
      <div className="flex flex-row gap-3 p-4 items-center border-b">
        <FiltersPopover
          filters={filters}
          uniqueAttributes={uniqueAttributes}
          projectId={projectId}
          collection={collection}
          collectionSchema={collectionSchema}
          onSubmit={(filters) => {
            setUrlQueryState({ where: JSON.stringify(filters) });
          }}
        />
        <OrderPopover
          uniqueAttributes={uniqueAttributes}
          collection={collection}
          collectionSchema={collectionSchema}
          order={order}
          onSubmit={(order) => {
            setUrlQueryState({ order: JSON.stringify(order) });
          }}
        />
        <div className="text-sm px-2">{`Showing ${
          sortedAndFilteredEntities.length
        } of ${allResults?.size ?? 0}`}</div>

        <CreateEntityForm
          collectionDefinition={collectionSchema}
          collection={collection}
          inferredAttributes={Array.from(uniqueAttributes)}
          client={client}
        />
      </div>
      <DataTable columns={columns} data={flatFilteredEntities} />
    </div>
  );
}

import { TriplitClient } from '@triplit/client';
import { useQuery } from '@triplit/react';
import { useMemo, useState, useCallback } from 'react';
import '@glideapps/glide-data-grid/dist/index.css';
import { CreateEntityForm } from '.';
import { consoleClient } from '../../triplit/client';
import { ColumnDef } from '@tanstack/react-table';
import {
  DataTable,
  DataCell,
  TriplitColumnHeader,
  RelationCell,
} from './data-table';
import { Button, Checkbox, Tooltip } from '@triplit/ui';
import { Plus } from 'lucide-react';
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
  client,
  schema,
  projectId,
}: {
  projectId: string;
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
      ['collectionName', '=', selectedCollection],
      ['projectId', '=', projectId],
    ])
  );
  const collectionSchema = schema?.collections?.[selectedCollection];
  const filters = JSON.parse(urlQueryState.where ?? '[]');
  const order = JSON.parse(urlQueryState.order ?? '[]');

  const { results: orderedAndFilteredResults } = useQuery(
    client,
    client
      .query(selectedCollection)
      .order(...order)
      .where(filters)
  );

  const { results: allResults } = useQuery(
    client,
    client.query(selectedCollection)
  );
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
      ? onDeselectAllEntities(selectedCollection, projectId)
      : onSelectAllEntities(
          sortedAndFilteredEntities.map(([id]) => id),
          selectedCollection,
          projectId
        );
  }, [
    sortedAndFilteredEntities,
    selectedCollection,
    projectId,
    allVisibleEntitiesAreSelected,
  ]);

  const idColumn: ColumnDef<any> = useMemo(
    () => ({
      header: () => (
        <div className="flex flex-row h-full items-center">
          <Tooltip label="Select all">
            <Checkbox
              className="ml-4 mr-1"
              checked={allVisibleEntitiesAreSelected}
              onCheckedChange={toggleSelectAllEntities}
            />
          </Tooltip>
          <TriplitColumnHeader attribute="id">
            {selectedEntities && selectedEntities.size > 0 && (
              <DeleteEntitiesDialog
                entityIds={[...selectedEntities.keys()]}
                collectionName={selectedCollection}
                client={client}
              />
            )}
          </TriplitColumnHeader>
        </div>
      ),
      size: 200,
      cell: ({ row }) => {
        // TODO: properly type tanstack table
        const entityId = row.getValue('id') as string;
        return (
          <div className="flex flex-row items-center h-full" key={entityId}>
            <Checkbox
              className="ml-4 mr-1"
              checked={selectedEntities && selectedEntities.has(entityId)}
              onCheckedChange={(checked) => {
                checked
                  ? onSelectEntity(entityId, selectedCollection, projectId)
                  : onDeselectEntity(entityId);
              }}
            />
            <DataCell
              attribute="id"
              value={row.getValue('id')}
              entityId={row.getValue('id')}
              collection={selectedCollection}
              client={client}
              selected={false}
              editable={false}
              onSelectCell={() => {}}
            />
          </div>
        );
      },
      accessorKey: 'id',
    }),
    [
      allVisibleEntitiesAreSelected,
      selectedCollection,
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
        const typeDef =
          collectionSchema?.schema?.properties?.[
            attr as keyof (typeof collectionSchema)['schema']['properties']
          ];
        const isQueryColumn = typeDef && typeDef.type === 'query';
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
                        let parsedVal = value;
                        if (typeof value === 'string' && value.startsWith('$'))
                          parsedVal = row.getValue(
                            value.split('$')[1] as string
                          );
                        if (parsedVal instanceof Set)
                          parsedVal = Array.from(parsedVal);
                        return [attribute, operator, parsedVal];
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
                key={row.getValue('id')}
                attributeDef={typeDef}
                selected={selectedCell === cellKey}
                onSelectCell={() => setSelectedCell(cellKey)}
                attribute={attr}
                collection={selectedCollection}
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

  const columns = [
    idColumn,
    ...dataColumns,
    {
      header: ({ column }) => {
        column;
        return (
          <div className="flex flex-col justify-center items-center h-full">
            <Tooltip label="Insert attribute">
              <Button
                onClick={() => setAddOrUpdateAttributeFormOpen(true)}
                variant={'ghost'}
                className="h-auto py-1"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </Tooltip>
          </div>
        );
      },
      size: 75,
      cell: () => null,
      accessorKey: 'new_column_creator',
    } as ColumnDef<any>,
  ];

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
            collectionName={selectedCollection}
            client={client}
            collectionSchema={collectionSchema}
          />

          <DeleteCollectionDialog
            open={deleteCollectionDialogOpen}
            onOpenChange={setDeleteCollectionDialogOpen}
            client={client}
          />
          <DeleteAttributeDialog
            collectionName={selectedCollection}
            attributeName={selectedAttribute}
            open={deleteAttributeDialogIsOpen}
            onOpenChange={(open) => {
              setDeleteAttributeDialogIsOpen(open);
              if (!open) setSelectedAttribute('');
            }}
            onSubmit={async () => {
              await deleteAttribute(
                client,
                selectedCollection,
                selectedAttribute
              );
              setDeleteAttributeDialogIsOpen(false);
            }}
          />
        </>
      )}
      <h3 className="px-4 mt-5 mb-1 text-2xl font-semibold tracking-tight flex flex-row gap-2">
        {selectedCollection}
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
      <div className="flex flex-row gap-4 p-4 items-center">
        <FiltersPopover
          filters={filters}
          uniqueAttributes={uniqueAttributes}
          projectId={projectId}
          collection={selectedCollection}
          collectionSchema={collectionSchema}
          onSubmit={(filters) => {
            setUrlQueryState({ where: JSON.stringify(filters) });
          }}
        />
        <OrderPopover
          uniqueAttributes={uniqueAttributes}
          collection={selectedCollection}
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
          collection={selectedCollection}
          inferredAttributes={Array.from(uniqueAttributes)}
          client={client}
        />
      </div>
      <DataTable columns={columns} data={flatFilteredEntities} />
    </div>
  );
}

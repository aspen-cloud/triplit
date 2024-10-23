import { TriplitClient } from '@triplit/client';
import { useInfiniteQuery } from '@triplit/react';
import { useMemo, useState } from 'react';
import { ConsoleQuery, CreateEntitySheet, SetConsoleQuery } from '.';
import { consoleClient } from '../../triplit/client';
import { ColumnDef } from '@tanstack/react-table';
import {
  DataTable,
  DataCell,
  TriplitColumnHeader,
  RelationCell,
} from './data-table';
import { Button, Checkbox, Select, Tooltip } from '@triplit/ui';
import { Plus } from 'lucide-react';
import {
  SchemaAttributeSheet,
  addOrUpdateAttributeFormOpenAtom,
} from './schema-attribute-sheet';
import { ColumnMenu } from './column-menu';
import { DeleteAttributeDialog } from './delete-attribute-dialog';
import { atom, useAtom } from 'jotai';
import { FiltersPopover } from './filters-popover';
import { OrderPopover } from './order-popover';
import { DeleteEntitiesDialog } from './delete-entities-dialog.js';
import { CollectionMenu } from './collection-menu.js';
import { DeleteCollectionDialog } from './delete-collection-dialog.js';
import { flattenSchema } from 'src/utils/flatten-schema.js';
import {
  TriplitError,
  getVariableComponents,
  isValueVariable,
  SchemaDefinition,
} from '@triplit/db';
import { deleteAttribute } from 'src/utils/schema.js';
import { useToast } from 'src/hooks/useToast.js';

const deleteAttributeDialogIsOpenAtom = atom(false);

if (typeof window !== 'undefined') window.client = consoleClient;

const PAGE_SIZE = 25;

export function DataViewer({
  client,
  schema,
  stats,
  query,
  setQuery,
}: {
  client: TriplitClient<any>;
  schema?: SchemaDefinition;
  stats?: { numEntities: number };
  query: ConsoleQuery;
  setQuery: SetConsoleQuery;
}) {
  const { toast } = useToast();
  const [deleteCollectionDialogOpen, setDeleteCollectionDialogOpen] =
    useState(false);
  const [deleteAttributeDialogIsOpen, setDeleteAttributeDialogIsOpen] = useAtom(
    deleteAttributeDialogIsOpenAtom
  );
  const [addOrUpdateAttributeFormOpen, setAddOrUpdateAttributeFormOpen] =
    useAtom(addOrUpdateAttributeFormOpenAtom);
  const [attributeToUpdateName, setAttributeToUpdateName] = useState<
    string | null
  >(null);
  const [selectedAttribute, setSelectedAttribute] = useState<string>('');
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const selectedCollection = query.collection!;
  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(
    new Set()
  );
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const collectionSchema = schema?.collections?.[selectedCollection];
  const filters = query.where;
  const order = query.order;

  const triplitQuery = useMemo(
    () =>
      client
        .query(selectedCollection)
        .order(...order)
        .where(filters)
        .limit(pageSize),
    [selectedCollection, order, filters, pageSize]
  );

  // TODO remove localOnly when we get rid of the whole-collection query above
  const {
    results: orderedAndFilteredResults,
    fetchingRemote,
    fetching,
    fetchingMore,
    hasMore,
    loadMore,
  } = useInfiniteQuery(client, triplitQuery);

  const flattenedCollectionSchema = useMemo(() => {
    if (!collectionSchema) return undefined;
    return flattenSchema(collectionSchema);
  }, [collectionSchema]);

  const uniqueAttributes: Set<string> = useMemo(() => {
    const attributes = new Set<string>();
    // if we have a schema, use it
    if (flattenedCollectionSchema) {
      // handle the case where we have a collection but no attributes
      return new Set(
        Object.keys(flattenedCollectionSchema.schema.properties ?? {})
      );
    }

    // Best we can do for now with schemaless is to load all attributes from the current set of entities
    if (!orderedAndFilteredResults) return attributes;
    // otherwise construct a set of all attributes from all entities
    orderedAndFilteredResults.forEach((entity) => {
      Object.keys(entity).forEach((key: string) => {
        if (!attributes.has(key) && key !== '_collection') {
          attributes.add(key);
        }
      });
    });
    return attributes;
  }, [orderedAndFilteredResults, flattenedCollectionSchema]);

  const allVisibleEntitiesAreSelected = useMemo(() => {
    if (!selectedEntities || selectedEntities.size === 0) return false;
    const allVisibleEntities = new Set<string>(
      orderedAndFilteredResults?.map((e) => e.id as string)
    );
    return Array.from(allVisibleEntities).every((id) =>
      selectedEntities.has(id)
    );
  }, [orderedAndFilteredResults, selectedEntities]);

  function onDeselectAllEntities() {
    setSelectedEntities(new Set());
  }

  function onDeselectEntity(entityId: string) {
    setSelectedEntities((prev) => {
      const next = new Set(prev);
      next.delete(entityId);
      return next;
    });
  }

  function onSelectEntity(entityId: string) {
    setSelectedEntities((prev) => {
      const next = new Set(prev);
      next.add(entityId);
      return next;
    });
  }

  function onSelectAllEntities() {
    setSelectedEntities(
      new Set(orderedAndFilteredResults?.map((e) => e.id as string))
    );
  }

  function toggleSelectAllEntities() {
    allVisibleEntitiesAreSelected
      ? onDeselectAllEntities()
      : onSelectAllEntities();
  }

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
                permissions={collectionSchema?.permissions}
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
                checked ? onSelectEntity(entityId) : onDeselectEntity(entityId);
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
      toggleSelectAllEntities,
      selectedEntities,
    ]
  );

  const dataColumns: ColumnDef<any>[] = useMemo(() => {
    return Array.from(uniqueAttributes)
      .filter((attr) => attr !== 'id')
      .map((attr) => {
        const typeDef = flattenedCollectionSchema?.schema.properties[attr];
        const isQueryColumn = typeDef && typeDef.type === 'query';
        return {
          cell: ({ row, column }) => {
            const cellKey = `${row.getValue('id')}_${column.id}`;
            const isOptional = !!collectionSchema?.schema.optional?.includes(
              //@ts-expect-error
              attr
            );
            if (isQueryColumn)
              return (
                <RelationCell
                  queryDef={typeDef}
                  onClickRelationLink={() => {
                    const where = typeDef?.query?.where;
                    let whereWithVariablesReplaced = where;
                    try {
                      whereWithVariablesReplaced = where?.map(
                        ([attribute, operator, value]) => {
                          let parsedVal = value;
                          if (isValueVariable(value)) {
                            const [scope, key] = getVariableComponents(value);
                            if (scope === undefined || scope === '1') {
                              parsedVal = row.getValue(key);
                            } else {
                              throw new TriplitError(
                                `${value} could not be handled in the filter [${attribute}, ${operator}, ${value}]. Only variables with the \'$1\' scope are supported.`
                              );
                            }
                          }
                          if (parsedVal instanceof Set)
                            parsedVal = Array.from(parsedVal);
                          return [attribute, operator, parsedVal];
                        }
                      );
                    } catch (e) {
                      if (e instanceof TriplitError)
                        toast({
                          title: 'Error',
                          description: e.contextMessage,
                          variant: 'destructive',
                        });
                      return;
                    }
                    setQuery({
                      where: whereWithVariablesReplaced,
                      collection: typeDef?.query?.collectionName,
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
                optional={isOptional}
                permissions={collectionSchema?.permissions}
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
                        setAttributeToUpdateName(attr);
                      }}
                    />
                  )
                }
              />
            );
          },
          accessorFn: (row) => row[attr],
          id: attr,
        };
      });
  }, [
    uniqueAttributes,
    collectionSchema,
    flattenedCollectionSchema,
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
                onClick={() => {
                  setAddOrUpdateAttributeFormOpen(true);
                  setAttributeToUpdateName(null);
                }}
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

  function flattenEntity(entity: any) {
    if (!entity) return {};
    const flatEntity: Record<string, any> = {};
    Object.entries(entity).forEach(([key, value]) => {
      if (
        typeof value === 'object' &&
        value !== null &&
        !(value instanceof Set) &&
        !(value instanceof Date)
      ) {
        Object.entries(flattenEntity(value)).forEach(
          ([nestedKey, nestedValue]) => {
            flatEntity[`${key}.${nestedKey}`] = nestedValue;
          }
        );
      } else {
        flatEntity[key] = value;
      }
    });
    return flatEntity;
  }

  const flatFilteredEntities = useMemo(() => {
    const flattened = orderedAndFilteredResults?.map((entity) => ({
      id: entity.id,
      ...flattenEntity(entity),
    }));
    return flattened;
  }, [orderedAndFilteredResults]);

  return (
    <div className="flex flex-col max-w-full items-start h-screen overflow-hidden">
      {flattenedCollectionSchema && (
        <>
          <SchemaAttributeSheet
            attributeToUpdateName={attributeToUpdateName}
            key={attributeToUpdateName ?? 'new'}
            open={addOrUpdateAttributeFormOpen}
            onOpenChange={setAddOrUpdateAttributeFormOpen}
            collectionName={selectedCollection}
            client={client}
            collectionSchema={flattenedCollectionSchema}
          />

          <DeleteCollectionDialog
            open={deleteCollectionDialogOpen}
            collection={query.collection}
            onDeleteCollection={() => {
              setQuery({}, false);
            }}
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
              const error = await deleteAttribute(
                client,
                selectedCollection,
                selectedAttribute
              );
              if (error) {
                toast({
                  title: 'Error',
                  description: error,
                  variant: 'destructive',
                });
              }
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
              setAttributeToUpdateName(null);
            }}
          />
        )}
      </h3>
      <div className="flex flex-row gap-4 p-4 items-center">
        <FiltersPopover
          filters={filters}
          uniqueAttributes={uniqueAttributes}
          collection={selectedCollection}
          collectionSchema={flattenedCollectionSchema}
          onSubmit={(filters) => {
            setQuery({ where: filters });
          }}
          client={client}
        />
        <OrderPopover
          uniqueAttributes={uniqueAttributes}
          collection={selectedCollection}
          collectionSchema={flattenedCollectionSchema}
          order={order}
          onSubmit={(order) => {
            setQuery({ order });
          }}
        />
        <div className="flex flex-row gap-2 items-center text-sm">
          <div className="whitespace-nowrap">Page size</div>
          <Select
            className="h-7"
            onValueChange={(v) => {
              setPageSize(Number(v));
            }}
            value={String(pageSize)}
            data={['25', '50', '100']}
          />
        </div>
        {!!orderedAndFilteredResults?.length && (
          <div className="text-sm">{`Showing ${orderedAndFilteredResults.length}
          ${
            stats && !filters?.length
              ? ` of ${parseTotalEstimate(stats.numEntities)}`
              : ''
          } entities`}</div>
        )}

        <CreateEntitySheet
          key={selectedCollection}
          collectionSchema={flattenedCollectionSchema}
          collection={selectedCollection}
          inferredAttributes={Array.from(uniqueAttributes)}
          client={client}
        />
      </div>
      {
        <DataTable
          columns={columns}
          data={flatFilteredEntities ?? []}
          showLoadMore={hasMore}
          loadMoreDisabled={fetchingMore || !hasMore}
          onLoadMore={loadMore}
        />
      }
    </div>
  );
}

function parseTotalEstimate(numEntities: number) {
  if (!numEntities || numEntities < 100) return '< 100';
  if (numEntities < 1000) {
    const ceil = Math.ceil(numEntities / 100) * 100;
    return `< ${formatGt1k(ceil)}`;
  }

  return `~ ${formatGt1k(numEntities)}`;
}

function formatGt1k(number: number) {
  if (number < 1000) return number;
  return `${(number / 1000).toFixed(1)}k`;
}

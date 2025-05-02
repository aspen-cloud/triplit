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
import { Button, Checkbox, Tooltip } from '@triplit/ui';
import { FiltersPopover } from './filters-popover';
import { OrderPopover } from './order-popover';
import { DeleteEntitiesDialog } from './delete-entities-dialog.js';
import { flattenSchema } from 'src/utils/flatten-schema.js';
import {
  TriplitError,
  getVariableComponents,
  isValueVariable,
  DBSchema,
  DataType,
  RecordType,
} from '@triplit/db';
import { useToast } from 'src/hooks/useToast.js';

if (typeof window !== 'undefined') window.client = consoleClient;

const PAGE_SIZE = 25;

const LOAD_MORE_OPTIONS = [25, 50, 100];

export function DataViewer({
  client,
  schema,
  stats,
  query,
  setQuery,
}: {
  client: TriplitClient<any>;
  schema?: DBSchema;
  stats?: { numEntities: number };
  query: ConsoleQuery;
  setQuery: SetConsoleQuery;
}) {
  const { toast } = useToast();
  // const [deleteCollectionDialogOpen, setDeleteCollectionDialogOpen] =
  //   useState(false);
  // const [deleteAttributeDialogIsOpen, setDeleteAttributeDialogIsOpen] = useAtom(
  //   deleteAttributeDialogIsOpenAtom
  // );
  // const [addOrUpdateAttributeFormOpen, setAddOrUpdateAttributeFormOpen] =
  //   useAtom(addOrUpdateAttributeFormOpenAtom);
  // const [attributeToUpdateName, setAttributeToUpdateName] = useState<
  //   string | null
  // >(null);
  // const [selectedAttribute, setSelectedAttribute] = useState<string>('');
  const selectedCollection = query.collection!;
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const collectionSchema = schema?.collections?.[selectedCollection];
  const filters = query.where;
  const order = query.order;

  const triplitQuery = useMemo(
    () =>
      client
        .query(selectedCollection)
        .Order(...order)
        .Where(filters)
        .Limit(pageSize),
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

  const idColumn: ColumnDef<any> = useMemo(
    () => ({
      header: ({ table }) => {
        const selectedEntities = useMemo(() => {
          const tracker = new Set<string>();
          for (const id in table.getState().rowSelection) {
            if (table.getState().rowSelection[id]) {
              tracker.add(id);
            }
          }
          return tracker;
        }, [table.getState().rowSelection]);
        return (
          <div className="flex flex-row h-full items-center">
            <Tooltip label="Select all">
              <Checkbox
                className="ml-4 mr-1"
                checked={
                  table.getIsAllRowsSelected()
                    ? true
                    : table.getIsSomeRowsSelected()
                      ? 'indeterminate'
                      : false
                }
                onCheckedChange={(checked) => {
                  if (checked === 'indeterminate') return;
                  table.toggleAllPageRowsSelected(checked);
                }}
              />
            </Tooltip>
            <TriplitColumnHeader attribute="id">
              {selectedEntities && selectedEntities.size > 0 && (
                <DeleteEntitiesDialog
                  permissions={collectionSchema?.permissions}
                  entityIds={Array.from(selectedEntities)}
                  collectionName={selectedCollection}
                  client={client}
                  onDialogConfirm={async () => {
                    await client.transact(async (tx) => {
                      for (const id of selectedEntities) {
                        await tx.delete(selectedCollection, id);
                      }
                    });
                    table.toggleAllPageRowsSelected(false);
                  }}
                />
              )}
            </TriplitColumnHeader>
          </div>
        );
      },
      size: 200,
      cell: ({ row }) => {
        // TODO: properly type tanstack table
        const entityId = row.getValue('id') as string;
        return (
          <div className="flex flex-row items-center h-full" key={entityId}>
            <Checkbox
              className="ml-4 mr-1"
              checked={row.getIsSelected()}
              onCheckedChange={row.getToggleSelectedHandler()}
            />
            <DataCell
              attribute="id"
              value={row.getValue('id')}
              entityId={row.getValue('id')}
              collection={selectedCollection}
              client={client}
              editable={false}
            />
          </div>
        );
      },
      accessorKey: 'id',
    }),
    [selectedCollection]
  );

  const dataColumns: ColumnDef<any>[] = useMemo(() => {
    const relationColumns: ColumnDef<any>[] = [];
    for (const relation in flattenedCollectionSchema?.relationships) {
      const relationDef = flattenedCollectionSchema.relationships[relation];
      relationColumns.push({
        cell: ({ row }) => {
          return (
            <RelationCell
              queryDef={relationDef}
              onClickRelationLink={() => {
                const where = relationDef.query.where;
                let whereWithVariablesReplaced = where;
                try {
                  whereWithVariablesReplaced = where?.map(
                    ([attribute, operator, value]) => {
                      let parsedVal = value;
                      if (isValueVariable(value)) {
                        const [scope, key] = getVariableComponents(value);
                        if (scope === undefined || scope == 1) {
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
                  collection: relationDef.query.collectionName,
                });
              }}
            />
          );
        },
        header: () => {
          return (
            <TriplitColumnHeader
              attribute={relation}
              attributeDef={relationDef}
              // rightIcon={
              //   typeDef && (
              //     <ColumnMenu
              //       onDelete={() => {
              //         setDeleteAttributeDialogIsOpen(true);
              //         setSelectedAttribute(attr);
              //       }}
              //       onEdit={() => {
              //         setAddOrUpdateAttributeFormOpen(true);
              //         setAttributeToUpdateName(attr);
              //       }}
              //     />
              //   )
              // }
            />
          );
        },
        accessorFn: (row) => row[relation],
        id: relation,
      });
    }
    const attributeColumns: ColumnDef<any>[] = Array.from(uniqueAttributes)
      .filter((attr) => attr !== 'id')
      .map((attr) => {
        const typeDef = flattenedCollectionSchema?.schema.properties[attr] as
          | DataType
          | undefined;
        const isOptional = typeDef?.config?.optional ?? false;
        return {
          cell: ({ row, column }) => {
            return (
              <DataCell
                key={row.getValue('id')}
                attributeDef={typeDef}
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
          header: () => {
            return (
              <TriplitColumnHeader
                attribute={attr}
                attributeDef={typeDef}
                // rightIcon={
                //   typeDef && (
                //     <ColumnMenu
                //       onDelete={() => {
                //         setDeleteAttributeDialogIsOpen(true);
                //         setSelectedAttribute(attr);
                //       }}
                //       onEdit={() => {
                //         setAddOrUpdateAttributeFormOpen(true);
                //         setAttributeToUpdateName(attr);
                //       }}
                //     />
                //   )
                // }
              />
            );
          },
          accessorFn: (row) => row[attr],
          id: attr,
        };
      });
    return [...attributeColumns, ...relationColumns];
  }, [uniqueAttributes, collectionSchema, flattenedCollectionSchema]);

  const columns = [
    idColumn,
    ...dataColumns,
    // {
    //   header: ({ column }) => {
    //     column;
    //     return (
    //       <div className="flex flex-col justify-center items-center h-full">
    //         <Tooltip label="Insert attribute">
    //           <Button
    //             onClick={() => {
    //               setAddOrUpdateAttributeFormOpen(true);
    //               setAttributeToUpdateName(null);
    //             }}
    //             variant={'ghost'}
    //             className="h-auto py-1"
    //           >
    //             <Plus className="h-4 w-4" />
    //           </Button>
    //         </Tooltip>
    //       </div>
    //     );
    //   },
    //   size: 75,
    //   cell: () => null,
    //   accessorKey: 'new_column_creator',
    // } as ColumnDef<any>,
  ];

  function flattenEntity(entity: any, collectionSchema?: RecordType) {
    if (!entity) return {};
    const flatEntity: Record<string, any> = {};
    Object.entries(entity).forEach(([key, value]) => {
      if (
        typeof value === 'object' &&
        value !== null &&
        !(value instanceof Set) &&
        !(value instanceof Date) &&
        // Don't flatten records that are JSON
        collectionSchema &&
        collectionSchema.properties[key].type !== 'json'
      ) {
        Object.entries(
          flattenEntity(value, collectionSchema.properties[key])
        ).forEach(([nestedKey, nestedValue]) => {
          flatEntity[`${key}.${nestedKey}`] = nestedValue;
        });
      } else {
        flatEntity[key] = value;
      }
    });
    return flatEntity;
  }

  const flatFilteredEntities = useMemo(() => {
    const flattened = orderedAndFilteredResults?.map((entity) => ({
      id: entity.id,
      ...flattenEntity(entity, collectionSchema?.schema),
    }));
    return flattened;
  }, [orderedAndFilteredResults]);

  return (
    <div className="flex flex-col max-w-full items-start h-full overflow-hidden">
      {/*
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
         */}
      {/* <h3 className="px-4 mt-5 mb-1 text-2xl font-semibold tracking-tight flex flex-row gap-2">
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
      </h3> */}
      <div className="flex flex-row gap-4 p-4 items-center">
        <span className="text-lg font-bold">{selectedCollection}</span>

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

        <CreateEntitySheet
          key={selectedCollection}
          collectionSchema={flattenedCollectionSchema}
          collection={selectedCollection}
          inferredAttributes={Array.from(uniqueAttributes)}
          client={client}
        />
      </div>
      <div className="relative overflow-auto max-w-full h-full w-full">
        <DataTable columns={columns} data={flatFilteredEntities ?? []} />
      </div>
      <div className="flex flex-row gap-7 items-center p-2 pl-4 text-xs text-muted-foreground">
        {!!orderedAndFilteredResults && (
          <div className="whitespace-nowrap">{`Showing ${
            orderedAndFilteredResults.length
          }
          ${
            stats && !filters?.length
              ? ` of ${parseTotalEstimate(stats.numEntities)}`
              : ''
          } entities`}</div>
        )}
        <div className="flex flex-row gap-1 items-center">
          <div>Load more:</div>
          {LOAD_MORE_OPTIONS.map((option) => (
            <Button
              variant={'secondary'}
              key={'load-more-' + option}
              className="h-auto py-1 text-xs px-1.5"
              onClick={() => {
                loadMore(option);
              }}
              disabled={!hasMore || fetchingMore}
            >
              {String(option)}
            </Button>
          ))}
        </div>
      </div>
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

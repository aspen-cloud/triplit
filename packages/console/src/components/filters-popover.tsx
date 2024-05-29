import { useCallback, useState } from 'react';
import { QueryFilter } from './query-filter';
import {
  Button,
  Code,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
} from '@triplit/ui';
import { typeFromJSON } from '../../../db/src/data-types/base';
import { QueryWhere } from '../../../db/src/query';
import { nanoid } from 'nanoid';
import { CollectionDefinition } from '@triplit/db';

type FiltersPopoverProps = {
  collection: string;
  projectId: string;
  onSubmit: (filters: QueryWhere<any, any>) => void;
  uniqueAttributes: Set<string>;
  collectionSchema: CollectionDefinition;
  filters: QueryWhere<any, any>;
};

function mapFilterArraysToFilterObjects(
  filters: QueryWhere<any, any>,
  collectionSchema?: CollectionDefinition
) {
  return filters.map(([attribute, operator, value]) => ({
    attribute,
    asType: collectionSchema
      ? collectionSchema?.schema?.properties?.[attribute]?.type
      : typeof value,
    operator,
    value,
    id: nanoid(),
  }));
}

function mapFilterObjectsToFilterArrays(filters: any[]) {
  return filters.map(({ attribute, operator, value }) => [
    attribute,
    operator,
    value,
  ]);
}

export function FiltersPopover(props: FiltersPopoverProps) {
  const { collection, uniqueAttributes, collectionSchema, onSubmit, filters } =
    props;

  const [key, setKey] = useState(+new Date());

  const [draftFilters, setDraftFilters] = useState(
    mapFilterArraysToFilterObjects(props.filters, collectionSchema)
  );
  const onCreateNewDraftFilter = useCallback(
    (attribute: string) => {
      setKey(+new Date());
      const attributeDefinition = collectionSchema
        ? collectionSchema?.schema?.properties?.[attribute]
        : null;
      const defaultType = attributeDefinition?.type ?? 'string';
      const defaultOperator = typeFromJSON(
        attributeDefinition ?? { type: defaultType }
      ).supportedOperations[0];
      const defaultValue = defaultType === 'boolean' ? true : '';

      const filterObj = {
        attribute,
        asType: defaultType,
        operator: defaultOperator,
        value: defaultValue,
        id: nanoid(),
      };
      setDraftFilters((prev) => [...prev, filterObj]);
    },
    [collectionSchema]
  );
  const filterAttributes = Array.from(uniqueAttributes);
  const hasFilters = filters.length > 0;
  return (
    <Popover
      onOpenChange={() =>
        setDraftFilters(
          mapFilterArraysToFilterObjects(filters, collectionSchema)
        )
      }
    >
      <PopoverTrigger asChild>
        <Button
          size={'sm'}
          variant={'secondary'}
          className={`${
            hasFilters ? 'bg-blue-500 hover:bg-blue-600' : ''
          } py-1 h-auto`}
        >
          <span className="mr-2">Filters</span>
          <span className={hasFilters ? '' : 'text-zinc-500'}>
            {filters.length}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="flex flex-col gap-3 w-full max-w-2xl"
      >
        {draftFilters.length > 0 ? (
          <div
            className={`grid ${
              collectionSchema ? 'grid-cols-9' : 'grid-cols-11'
            } gap-2`}
          >
            {draftFilters.map((data, index) => (
              <QueryFilter
                filter={data}
                onUpdate={(filterField, newValue) => {
                  setDraftFilters((prev) =>
                    prev.map((filter) => {
                      if (filter.id === data.id) {
                        return { ...filter, [filterField]: newValue };
                      }
                      return filter;
                    })
                  );
                }}
                attributes={filterAttributes}
                collectionDefinition={collectionSchema}
                onPressRemove={() => {
                  setDraftFilters((prev) =>
                    prev.filter((f) => f.id !== data.id)
                  );
                }}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No filters applied to <Code>{collection}</Code>
          </p>
        )}
        <form
          className="flex flex-row gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(mapFilterObjectsToFilterArrays(draftFilters));
          }}
        >
          <Select
            key={key}
            placeholder="Add Filter"
            disabled={filterAttributes.length === 0}
            onValueChange={onCreateNewDraftFilter}
            data={filterAttributes}
          />
          <Button type="submit">Apply</Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

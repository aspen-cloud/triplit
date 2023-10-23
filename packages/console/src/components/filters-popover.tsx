import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from 'packages/console/@/components/ui/popover';
import { useCallback, useState } from 'react';
import { QueryFilter } from './query-filter';
import { Button } from 'packages/console/@/components/ui/button';
import { Code } from 'packages/console/@/components/ui/code';
import { Select } from 'packages/console/@/components/ui/simple-select';
import { typeFromJSON } from '../../../db/src/data-types/base';
import { QueryWhere } from '../../../db/src/query';
import { randomId } from '@mantine/hooks';

type FiltersPopoverProps = {
  collection: string;
  projectId: string;
  onSubmit: (filters: QueryWhere<any>) => void;
  uniqueAttributes: Set<string>;
  collectionSchema: any;
  filters: QueryWhere<any>;
};

function mapFilterArraysToFilterObjects(
  filters: QueryWhere<any>,
  collectionSchema?: any
) {
  return filters.map(([attribute, operator, value]) => ({
    attribute,
    asType: collectionSchema
      ? collectionSchema.schema?.properties?.[attribute]?.type
      : typeof value,
    operator,
    value,
    id: randomId(),
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

  const [draftFilters, setDraftFilters] = useState(
    mapFilterArraysToFilterObjects(props.filters, collectionSchema)
  );

  const onCreateNewDraftFilter = useCallback(
    (attribute: string) => {
      const attributeDefinition = collectionSchema
        ? collectionSchema.schema?.properties?.[attribute]
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
        id: randomId(),
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
          className={`${hasFilters ? 'bg-blue-500 hover:bg-blue-600' : ''}`}
        >
          <span className="mr-2">Filters</span>
          <span className={hasFilters ? '' : 'text-zinc-500'}>
            {filters.length}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="flex flex-col gap-3 w-full">
        {draftFilters.length > 0 ? (
          draftFilters.map((data, index) => (
            <div key={data.id} className="flex flex-row gap-1 items-end">
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
                model={collectionSchema}
                onPressRemove={() => {
                  setDraftFilters((prev) =>
                    prev.filter((f) => f.id !== data.id)
                  );
                }}
              />
            </div>
          ))
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
            disabled={filterAttributes.length === 0}
            value={
              filterAttributes.length > 0
                ? 'Select an attribute to filter by'
                : 'No attributes that can be used to filter'
            }
            onValueChange={onCreateNewDraftFilter}
            data={filterAttributes}
          />
          <Button type="submit">Apply</Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

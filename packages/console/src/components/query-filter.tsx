import { useCallback } from 'react';
import { Select, Input, FormField, CloseButton } from '@triplit/ui';
import {
  ALL_TYPES,
  Collection,
  SUPPORTED_OPERATIONS,
  DataTypeKeys,
  DataType,
  PrimitiveTypeKeys,
} from '@triplit/db';

export function QueryFilter({
  filter,
  onUpdate,
  attributes,
  onPressRemove,
  collectionDefinition,
}: {
  filter: {
    attribute: string;
    operator: string;
    value: string;
    asType: PrimitiveTypeKeys;
    id: string;
  };
  onUpdate: (
    filterField: string,
    newValue: string | number | boolean | Date
  ) => void;
  attributes: string[];
  onPressRemove: () => void;
  collectionDefinition?: Collection;
}) {
  const { attribute, operator, value, asType } = filter;
  const attributeDefinition: DataType = collectionDefinition?.schema
    ?.properties[
    attribute as keyof (typeof collectionDefinition)['schema']['properties']
  ] ?? {
    type: asType,
    config: {},
  };

  const onChangeAttribute = useCallback(
    (attr: string) => {
      const newAttributeDefinition: DataType = collectionDefinition?.schema
        ?.properties?.[
        attr as keyof (typeof collectionDefinition)['schema']['properties']
      ] ?? {
        type: 'string',
        config: {},
      };
      if (newAttributeDefinition.type !== asType) {
        onUpdate('value', '');
        onUpdate('asType', newAttributeDefinition.type);
        onUpdate(
          'operator',
          SUPPORTED_OPERATIONS[newAttributeDefinition.type][0]
        );
      }
      onUpdate('attribute', attr);
    },
    [collectionDefinition, asType, onUpdate]
  );

  const onChangeType = useCallback(
    (type: DataTypeKeys) => {
      onUpdate('value', '');
      onUpdate('asType', type);
      onUpdate('operator', SUPPORTED_OPERATIONS[type][0]);
    },
    [operator]
  );

  const valueInputType =
    attributeDefinition && attributeDefinition.type === 'set'
      ? attributeDefinition.items.type
      : asType;

  const compositeSupportedOperations =
    attributeDefinition && attributeDefinition.type === 'set'
      ? Array.from(
          new Set([
            ...SUPPORTED_OPERATIONS[asType],
            ...SUPPORTED_OPERATIONS[attributeDefinition.items.type],
          ])
        )
      : SUPPORTED_OPERATIONS[asType];
  return (
    <>
      <Select
        className="col-span-3"
        key={`attribute-${filter.id}`}
        value={attribute}
        onValueChange={onChangeAttribute}
        data={attributes}
      />
      {!collectionDefinition && (
        <Select
          className="col-span-2"
          key={`type-${filter.id}`}
          value={asType}
          onValueChange={onChangeType}
          data={ALL_TYPES.filter((t) => t !== 'set' && t !== 'date')}
        />
      )}
      <Select
        className="col-span-2"
        key={`operator-${filter.id}`}
        value={operator}
        onValueChange={(value) => onUpdate('operator', value ?? '')}
        data={compositeSupportedOperations}
      />
      {valueInputType === 'string' && (
        <Input
          key={`value-${filter.id}`}
          className="col-span-3"
          type="text"
          value={value}
          onChange={(e) => onUpdate('value', e.target.value)}
        />
      )}
      {valueInputType === 'number' && (
        <Input
          key={`value-${filter.id}`}
          className="col-span-3"
          type="number"
          value={value}
          onChange={(value) => onUpdate('value', value.target.valueAsNumber)}
        />
      )}
      {valueInputType === 'boolean' && (
        <Select
          key={`value-${filter.id}`}
          className="col-span-3"
          defaultValue="true"
          value={String(value)}
          onValueChange={(value) => onUpdate('value', value === 'true')}
          data={['true', 'false']}
        />
      )}
      {valueInputType === 'date' && (
        <Input
          key={`value-${filter.id}`}
          className="col-span-3"
          type="datetime-local"
          value={value}
          onChange={(e) => onUpdate('value', e.target.value)}
        />
      )}
      <CloseButton
        key={`remove-btn-${filter.id}`}
        className="h-full col-span-1"
        onClick={onPressRemove}
      />
    </>
  );
}

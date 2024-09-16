import { AttributeDefinition, Model } from '@triplit/db';
import { useCallback } from 'react';
import { Select, Input, FormField, CloseButton } from '@triplit/ui';
import {
  CollectionDefinition,
  ALL_TYPES,
  CollectionTypeKeys,
  ValueTypeKeys,
  Operator,
  typeFromJSON,
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
    operator: Operator;
    value: string;
    asType: string;
    id: string;
  };
  onUpdate: (
    filterField: string,
    newValue: string | number | boolean | Date
  ) => void;
  attributes: string[];
  onPressRemove: () => void;
  collectionDefinition?: CollectionDefinition;
}) {
  const { attribute, operator, value, asType } = filter;
  const attributeDefinition = collectionDefinition?.schema?.properties[
    attribute as keyof (typeof collectionDefinition)['schema']['properties']
  ] ?? {
    type: asType,
    options: {},
  };

  const onChangeAttribute = useCallback(
    (attr: string) => {
      const newAttributeDefinition = collectionDefinition?.schema?.properties?.[
        attr as keyof (typeof collectionDefinition)['schema']['properties']
      ] ?? {
        type: 'string',
        options: {},
      };
      if (newAttributeDefinition.type !== asType) {
        onUpdate('value', '');
        onUpdate('asType', newAttributeDefinition.type);
        onUpdate(
          'operator',
          typeFromJSON(newAttributeDefinition).supportedOperations[0]
        );
      }
      onUpdate('attribute', attr);
    },
    [collectionDefinition, asType, onUpdate]
  );

  const onChangeType = useCallback(
    (type: ValueTypeKeys | CollectionTypeKeys) => {
      onUpdate('value', '');
      onUpdate('asType', type);
      const newOperatorOptions = typeFromJSON({
        type,
        items: { type: 'string', options: {} },
      }).supportedOperations;
      if (!newOperatorOptions.includes(operator))
        onUpdate('operator', newOperatorOptions[0]);
    },
    [operator]
  );

  const valueInputType =
    attributeDefinition && attributeDefinition.type === 'set'
      ? attributeDefinition.items.type
      : asType;
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
        data={typeFromJSON(attributeDefinition).supportedOperations}
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

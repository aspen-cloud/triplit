import { AttributeDefinition, Model } from '@triplit/db';
import { useCallback } from 'react';
import { Select, Input, FormField, CloseButton } from '@triplit/ui';
import { typeFromJSON } from '../../../db/src/data-types/base';
import {
  ALL_TYPES,
  CollectionTypeKeys,
  ValueTypeKeys,
} from '../../../db/src/data-types/serialization';
import { CollectionDefinition } from '@triplit/db';

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
    asType: string;
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
  const attributeDefinition = (collectionDefinition?.schema?.properties[
    attribute
  ] ?? {
    type: asType,
  }) as AttributeDefinition;

  const onChangeAttribute = useCallback(
    (attr: string) => {
      const newAttributeDefinition = collectionDefinition?.schema?.properties?.[
        attr
      ] ?? {
        type: 'string',
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
        items: { type: 'string' },
      }).supportedOperations;
      if (!newOperatorOptions.includes(operator))
        onUpdate('operator', newOperatorOptions[0]);
    },
    [operator]
  );

  const valueInputType =
    asType === 'set' && attributeDefinition
      ? attributeDefinition.items.type
      : asType;
  return (
    <>
      <Select
        className="col-span-3"
        value={attribute}
        onValueChange={onChangeAttribute}
        data={attributes}
      />
      {!collectionDefinition && (
        <Select
          className="col-span-2"
          value={asType}
          onValueChange={onChangeType}
          data={ALL_TYPES.filter((t) => t !== 'set' && t !== 'date')}
        />
      )}
      <Select
        className="col-span-2"
        value={operator}
        onValueChange={(value) => onUpdate('operator', value ?? '')}
        data={typeFromJSON(attributeDefinition).supportedOperations}
      />
      {valueInputType === 'string' && (
        <Input
          className="col-span-3"
          type="text"
          value={value as string}
          onChange={(e) => onUpdate('value', e.target.value)}
        />
      )}
      {valueInputType === 'number' && (
        <Input
          className="col-span-3"
          type="number"
          value={value as number}
          onChange={(value) => onUpdate('value', value.target.valueAsNumber)}
        />
      )}
      {valueInputType === 'boolean' && (
        <Select
          className="col-span-3"
          defaultValue="true"
          value={String(value)}
          onValueChange={(value) => onUpdate('value', value === 'true')}
          data={['true', 'false']}
        />
      )}
      {valueInputType === 'date' && (
        <Input
          className="col-span-3"
          type="datetime-local"
          value={value}
          onChange={(e) => onUpdate('value', e.target.value)}
        />
      )}
      <CloseButton className="h-full col-span-1" onClick={onPressRemove} />
    </>
  );
}

import { AttributeDefinition, Model } from '@triplit/db';
import { useCallback } from 'react';
import { Select } from 'packages/console/@/components/ui/simple-select';
import { Input } from 'packages/console/@/components/ui/input';
import { FormField } from 'packages/console/@/components/ui/form-field';
import { CloseButton } from 'packages/console/@/components/ui/close-button';
import { typeFromJSON } from '../../../db/src/data-types/base';
import {
  ALL_TYPES,
  CollectionTypeKeys,
  ValueTypeKeys,
} from '../../../db/src/data-types/serialization';

export function QueryFilter({
  filter,
  onUpdate,
  attributes,
  onPressRemove,
  schema,
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
  schema?: Model<any>;
}) {
  const { attribute, operator, value, asType } = filter;
  const attributeDefinition = (schema?.properties[attribute] ?? {
    type: asType,
  }) as AttributeDefinition;

  const onChangeAttribute = useCallback(
    (attr: string) => {
      const newAttributeDefinition = schema?.properties?.[attr] ?? {
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
    [schema, asType, onUpdate]
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
    <div className="flex flex-row gap-3 p-1 items-end">
      <FormField label="attribute">
        <Select
          value={attribute}
          onValueChange={onChangeAttribute}
          data={attributes}
        />
      </FormField>
      <FormField label="type">
        <Select
          disabled={!!schema}
          value={asType}
          onValueChange={onChangeType}
          data={
            schema
              ? ALL_TYPES
              : ALL_TYPES.filter((t) => t !== 'set' && t !== 'date')
          }
        />
      </FormField>
      <FormField label="operator">
        <Select
          value={operator}
          onValueChange={(value) => onUpdate('operator', value ?? '')}
          data={typeFromJSON(attributeDefinition).supportedOperations}
        />
      </FormField>
      <FormField label="value">
        {valueInputType === 'string' && (
          <Input
            type="text"
            value={value as string}
            onChange={(e) => onUpdate('value', e.target.value)}
          />
        )}
        {valueInputType === 'number' && (
          <Input
            type="number"
            value={value as number}
            onChange={(value) => onUpdate('value', value.target.valueAsNumber)}
          />
        )}
        {valueInputType === 'boolean' && (
          <Select
            defaultValue="true"
            value={String(value)}
            onValueChange={(value) => onUpdate('value', value === 'true')}
            data={['true', 'false']}
          />
        )}
        {valueInputType === 'date' && (
          <Input
            className="w-[150px]"
            type="datetime-local"
            value={value}
            onChange={(e) => onUpdate('value', e.target.value)}
          />
        )}
      </FormField>
      <CloseButton className="mb-2" onClick={onPressRemove} />
    </div>
  );
}

import {
  CollectionAttributeDefinition,
  AttributeDefinition,
  Model,
} from '@triplit/db';
import { useEffect, useMemo, useState } from 'react';
import '@glideapps/glide-data-grid/dist/index.css';
import { SetInput } from 'packages/console/@/components/ui/set-input';
import { Button } from 'packages/console/@/components/ui/button';
import { Input } from 'packages/console/@/components/ui/input';
import { Select } from 'packages/console/@/components/ui/simple-select';
import { randomId } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { CloseButton } from 'packages/console/@/components/ui/close-button';
import { FormField } from 'packages/console/@/components/ui/form-field';
import { Combobox } from 'packages/console/@/components/ui/combobox';
import { Textarea } from 'packages/console/@/components/ui/textarea';
import { Checkbox } from 'packages/console/@/components/ui/checkbox';
import {
  CollectionTypeKeys,
  QueryAttributeDefinition,
  RecordAttributeDefinition,
  ValueAttributeDefinition,
  ValueTypeKeys,
} from '../../../db/src/data-types/serialization';
import { Collection } from '../../../db/src/schema.js';

interface FormValues {
  id: string;
  attributes: {
    fieldName: string;
    type: Exclude<AttributeDefinition['type'], 'record'>;
    nullable: boolean;
    setItemsType?: CollectionAttributeDefinition['items']['type'];
    fieldValue: string | Set<any>;
    key: string;
  }[];
}

function convertFormToEntity(attributes: FormValues['attributes']) {
  const entity: any = {};
  attributes.forEach((attr) => {
    const { type, fieldValue, fieldName } = attr;
    if (attr.nullable && fieldValue === null) entity[fieldName] = null;
    else if (type === 'boolean') {
      entity[fieldName] = fieldValue === 'true';
    } else if (type === 'number') {
      entity[fieldName] = Number(fieldValue);
    } else if (type === 'date' && !(fieldValue instanceof Set)) {
      fieldValue
        ? (entity[fieldName] = new Date(fieldValue))
        : delete entity[fieldName];
    } else {
      entity[fieldName] = fieldValue;
    }
  });
  return entity;
}

function initializeNewEntityForm(model?: Collection<any>): FormValues {
  if (!model) return { id: '', attributes: [] };
  const attributes = (
    Object.entries(model.schema.properties) as [
      string,
      Exclude<AttributeDefinition, RecordAttributeDefinition>
    ][]
  )
    .filter(([_attr, definition]) => definition.type !== 'query')
    .map(([attr, attributeDef]) => {
      const type = attributeDef.type;
      const nullable = attributeDef.options.nullable;
      return {
        type,
        setItemsType: type === 'set' ? attributeDef?.items?.type : undefined,
        nullable,
        fieldName: attr,
        fieldValue: type === 'set' ? new Set() : '',
        key: attr,
      };
    });
  return { id: '', attributes };
}

function TypeLabel({
  name,
  type,
  setItemsType,
}: {
  name: string;
  type: ValueTypeKeys | CollectionTypeKeys;
  setItemsType?: ValueTypeKeys;
}) {
  return (
    <div className="flex flex-row gap-2 items-center w-full">
      {name}
      {
        <div className="text-xs text-zinc-500">
          {`${type}`}
          {setItemsType && (
            <span className="text-blue-800">
              {'<'}
              <span className="text-zinc-500">{setItemsType}</span>
              {'>'}
            </span>
          )}
        </div>
      }
    </div>
  );
}

export function CreateEntityForm({
  collection,
  inferredAttributes,
  collectionDefinition,
  onCreate,
  onCancel,
}: {
  collection: string;
  inferredAttributes?: string[];
  collectionDefinition?: Collection<any>;
  onCreate: (entity: any, id: string) => void;
  onCancel: () => void;
}) {
  const form = useForm<FormValues>({
    initialValues: initializeNewEntityForm(collectionDefinition),
  });

  const [customAttributes, setCustomAttributes] = useState<string[]>([]);
  const allAttributes = [
    ...(inferredAttributes ? inferredAttributes : []),
    ...customAttributes,
  ];
  const unselectedAttributes = useMemo(() => {
    if (allAttributes.length === 0 || collectionDefinition) return [];
    return allAttributes.filter(
      (attr) => !form.values.attributes.find((item) => item.fieldName === attr)
    );
  }, [form.values.attributes, collectionDefinition, allAttributes]);

  useEffect(() => {
    form.setValues(initializeNewEntityForm(collectionDefinition));
    setCustomAttributes([]);
  }, [collection, collectionDefinition]);

  const fields = useMemo(
    () =>
      form.values.attributes.map((item, index) => (
        <div
          key={item.key}
          className={`flex w-full flex-row ${
            collectionDefinition ? 'items-center' : 'items-start'
          } gap-2`}
        >
          {!collectionDefinition && (
            <>
              <Combobox
                placeholder="Add an attribute..."
                className="w-[37.5%]"
                data={unselectedAttributes.concat(
                  item.fieldName ? [item.fieldName] : []
                )}
                onAddValue={(query) => {
                  setCustomAttributes((prev) => [...prev, query]);
                  return query;
                }}
                value={item.fieldName}
                onChangeValue={(value) => {
                  form.setFieldValue(`attributes.${index}.fieldName`, value);
                }}
              />
              <Select
                className="w-1/4"
                data={['string', 'boolean', 'number']}
                value={item.type}
                onValueChange={(value) => {
                  form.setFieldValue(`attributes.${index}.type`, value);
                }}
              />
            </>
          )}
          <FormField
            label={
              collectionDefinition && (
                <TypeLabel
                  name={item.fieldName}
                  type={item.type}
                  setItemsType={item.setItemsType}
                />
              )
            }
          >
            {item.type === 'string' && (
              <Textarea
                disabled={item.fieldValue === null}
                value={item.fieldValue ?? ''}
                onChange={(e) => {
                  form.setFieldValue(
                    `attributes.${index}.fieldValue`,
                    e.target.value
                  );
                }}
              />
            )}
            {item.type === 'number' && (
              <Input
                type="number"
                disabled={item.fieldValue === null}
                {...form.getInputProps(`attributes.${index}.fieldValue`)}
              />
            )}
            {item.type === 'date' && (
              <Input
                type="datetime-local"
                disabled={item.fieldValue === null}
                {...form.getInputProps(`attributes.${index}.fieldValue`)}
              />
            )}
            {item.type === 'boolean' && (
              <Select
                disabled={item.fieldValue === null}
                data={['true', 'false']}
                value={item.fieldValue}
                onValueChange={(value) => {
                  form.setFieldValue(`attributes.${index}.fieldValue`, value);
                }}
              />
            )}
            {item.type === 'set' && (
              <SetInput
                value={form.values.attributes[index].fieldValue}
                onChange={(value) => {
                  form.setFieldValue(`attributes.${index}.fieldValue`, value);
                }}
                renderItem={
                  item?.setItemsType === 'date'
                    ? (date: Date) => date.toISOString()
                    : undefined
                }
                parse={PARSE_FUNCS[item.setItemsType]}
              />
            )}
          </FormField>
          {item.nullable ||
            (!collectionDefinition && (
              <div className="flex flex-col gap-2 self-end items-center mb-[10px]">
                <p className="text-sm mb-2">Null?</p>
                <Checkbox
                  className="h-[20px] w-[20px]"
                  checked={item.fieldValue === null}
                  onCheckedChange={(checked) => {
                    checked
                      ? form.setFieldValue(
                          `attributes.${index}.fieldValue`,
                          null
                        )
                      : form.setFieldValue(
                          `attributes.${index}.fieldValue`,
                          ''
                        );
                  }}
                />
              </div>
            ))}
          {!collectionDefinition && (
            <CloseButton
              onClick={() => form.removeListItem('attributes', index)}
            />
          )}
        </div>
      )),
    [
      form,
      collectionDefinition,
      inferredAttributes,
      unselectedAttributes,
      customAttributes,
    ]
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onCreate(convertFormToEntity(form.values.attributes), form.values.id);
      }}
      className="flex flex-col gap-4"
    >
      <FormField label="id" description="The primary key for this entity">
        <Input
          placeholder="auto-generate (leave blank)"
          {...form.getInputProps('id')}
        />
      </FormField>
      {!collectionDefinition && <div className="text-xs -mb-3">Attributes</div>}
      {fields}
      {!collectionDefinition && (
        <Button
          variant={'default'}
          type="button"
          onClick={() => {
            form.insertListItem('attributes', {
              fieldName:
                unselectedAttributes.length > 0 ? unselectedAttributes[0] : '',
              type: 'string',
              fieldValue: '',
              key: randomId(),
            });
          }}
        >
          Add attribute
        </Button>
      )}
      <div className="flex flex-row self-end gap-2">
        {/* todo update so that onClose clears state */}
        <Button type="button" onClick={onCancel} variant="outline">
          Cancel
        </Button>
        <Button type="submit">Create</Button>
      </div>
    </form>
  );
}

function parseDate(value: string) {
  const val = new Date(value);
  if (String(val) === 'Invalid Date') throw new Error('Invalid Date');
  return val;
}

function parseNumber(value: string) {
  const val = Number(value);
  if (isNaN(val)) throw new Error('Invalid Number');
  return val;
}

function parseBoolean(value: string) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('Invalid Boolean');
}

export const PARSE_FUNCS = {
  date: parseDate,
  number: parseNumber,
  boolean: parseBoolean,
};

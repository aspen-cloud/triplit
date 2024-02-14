import {
  AttributeDefinition,
  Schema,
  CollectionAttributeDefinition,
  CollectionDefinition,
} from '@triplit/db';
import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  CloseButton,
  Code,
} from '@triplit/ui';
import { ComponentProps, useEffect, useState, useCallback } from 'react';
import { TriplitClient } from '@triplit/client';

import { atom, useAtom } from 'jotai';
import {
  ALL_TYPES,
  AllTypes,
  RecordAttributeDefinition,
  UserTypeOptions,
  VALUE_TYPE_KEYS,
  ValueAttributeDefinition,
  ValueTypeKeys,
} from '../../../db/src/data-types/serialization';
import { randomId } from '@mantine/hooks';

export type AttributesForm = {
  [key: string]: AttributeDefinition;
};

async function addAttributeToSchema(
  client: TriplitClient<any>,
  collectionName: string,
  attributeName: string,
  newAttribute: AttributeDefinition
) {
  await client.db.addAttribute({
    collection: collectionName,
    path: [attributeName],
    attribute: newAttribute,
  });
}

async function updateAttributeOptions(
  client: TriplitClient<any>,
  collectionName: string,
  attributeName: string,
  options: UserTypeOptions
) {
  await client.db.alterAttributeOption({
    collection: collectionName,
    path: [attributeName],
    options,
  });
}

async function dropDefaultOption(
  client: TriplitClient<any>,
  collectionName: string,
  attributeName: string
) {
  await client.db.dropAttributeOption({
    collection: collectionName,
    path: [attributeName],
    option: 'default',
  });
}

function getDefaultOptionsFromType(type: ValueTypeKeys) {
  if (type === 'date') return ['Value', 'now'];
  if (type === 'string') return ['Value', 'uuid'];
  else return ['Value'];
}

type NewAttributeFormProps = {
  client: TriplitClient<any>;
  collectionName: string;
  collectionSchema: CollectionDefinition;
};
export const addOrUpdateAttributeFormOpenAtom = atom(false);

export const attributeToUpdateAtom = atom<
  | ((
      | ValueAttributeDefinition
      | CollectionAttributeDefinition
      | RecordAttributeDefinition
    ) & {
      name: string;
    })
  | null
>(null);

export function SchemaAttributeSheet(
  props: NewAttributeFormProps & ComponentProps<typeof Sheet>
) {
  const { client, collectionName, collectionSchema } = props;
  const [attributeToUpdate, setAttributeToUpdate] = useAtom(
    attributeToUpdateAtom
  );
  const editing = !!attributeToUpdate;
  const [open, setOpen] = useAtom(addOrUpdateAttributeFormOpenAtom);
  const [attributeName, setAttributeName] = useState('');
  const [attributeBaseType, setAttributeBaseType] =
    useState<AllTypes>('string');
  const [hasDefault, setHasDefault] = useState(false);
  const [setType, setSetType] = useState<ValueTypeKeys>('string');
  const [defaultType, setDefaultType] = useState<'Value' | 'now' | 'uuid'>(
    'Value'
  );
  const [recordKeyTypes, setRecordKeyTypes] = useState<
    Record<string, [string, ValueTypeKeys]>
  >({});
  const [defaultValue, setDefaultValue] = useState('');
  const [nullable, setNullable] = useState(false);

  function setDefaults() {
    setAttributeName('');
    setRecordKeyTypes({});
    setAttributeBaseType('string');
    setSetType('string');
    setDefaultType('Value');
    setDefaultValue('');
    setNullable(false);
    setHasDefault(false);
  }

  useEffect(() => {
    if (attributeToUpdate) {
      setAttributeName(attributeToUpdate.name);
      setAttributeBaseType(attributeToUpdate.type);
      if (attributeToUpdate.type === 'record') {
        setRecordKeyTypes(
          Object.fromEntries(
            Object.entries(attributeToUpdate.properties).map(([key, value]) => [
              key,
              [key, value.type],
            ])
          )
        );
        return;
      }
      setNullable(attributeToUpdate?.options?.nullable ?? false);

      if (attributeToUpdate.type === 'set') {
        setSetType(attributeToUpdate.items.type);
        return;
      }

      if (attributeToUpdate?.options?.default === undefined) {
        setHasDefault(false);
        setDefaultType('Value');
        setDefaultValue('');
        return;
      }
      setHasDefault(true);
      if (typeof attributeToUpdate.options.default === 'object') {
        setDefaultType(attributeToUpdate.options.default.func);
      } else {
        setDefaultType('Value');
        setDefaultValue(String(attributeToUpdate.options.default));
      }
    } else {
      setDefaults();
    }
  }, [attributeToUpdate]);

  const formToAttributeDefinition = useCallback(() => {
    const baseAttribute = { type: attributeBaseType };
    if (attributeBaseType === 'set') {
      return {
        ...baseAttribute,
        items: { type: setType },
        options: { nullable },
      } as CollectionAttributeDefinition;
    }
    if (attributeBaseType === 'record') {
      return {
        ...baseAttribute,
        properties: Object.fromEntries(
          Object.entries(recordKeyTypes).map(([_key, [name, type]]) => [
            name,
            { type },
          ])
        ),
      } as RecordAttributeDefinition;
    }
    const baseOptions = { nullable };
    if (!hasDefault) return { ...baseAttribute, options: baseOptions };
    let value: any = '';
    if (defaultType === 'Value')
      value =
        attributeBaseType === 'date' && defaultValue !== undefined
          ? new Date(defaultValue)
          : defaultValue;
    if (defaultType === 'now') value = Schema.Default.now();
    if (defaultType === 'uuid') value = Schema.Default.uuid();
    return {
      ...baseAttribute,
      options: { ...baseOptions, default: value },
    } as AttributeDefinition;
  }, [
    attributeBaseType,
    setType,
    recordKeyTypes,
    nullable,
    hasDefault,
    defaultType,
    defaultValue,
  ]);

  const submitForm = useCallback(async () => {
    const updatedAttribute =
      formToAttributeDefinition() as ValueAttributeDefinition;
    if (!attributeToUpdate) {
      await addAttributeToSchema(
        client,
        collectionName,
        attributeName,
        updatedAttribute
      );
      setOpen(false);
      setDefaults();
      return;
    }
    if (
      updatedAttribute.options.default === undefined &&
      attributeToUpdate.options?.default !== undefined
    ) {
      await dropDefaultOption(client, collectionName, attributeName);
    }
    await updateAttributeOptions(
      client,
      collectionName,
      attributeName,
      updatedAttribute.options
    );

    setOpen(false);
  }, [
    setDefaults,
    attributeToUpdate,
    client,
    attributeName,
    collectionName,
    formToAttributeDefinition,
  ]);

  return (
    <Sheet
      open={open}
      onOpenChange={(open) => {
        setOpen(open);
        if (!open) setAttributeToUpdate(null);
      }}
    >
      <SheetContent className="text-sm sm:max-w-[40%] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {attributeToUpdate ? (
              <span>
                Update <Code>{attributeToUpdate.name}</Code>
              </span>
            ) : (
              'Insert attribute'
            )}
          </SheetTitle>
          <SheetDescription>
            {attributeToUpdate ? (
              <span>
                Update <Code>{attributeToUpdate.name}</Code> on{' '}
                <Code>{collectionName}</Code>
              </span>
            ) : (
              <span>
                Add a new attribute to <Code>{collectionName}</Code>
              </span>
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="grid grid-cols-3 mt-10">
          <div className="font-bold">General</div>
          <div className="flex flex-col gap-5 col-span-2">
            <div className="flex flex-col gap-3">
              <Label>Name</Label>
              <Input
                disabled={editing}
                placeholder="attribute_name"
                value={attributeName}
                onChange={(e) => {
                  setAttributeName(e.target.value);
                }}
              />
            </div>
            <div className="flex flex-col gap-3">
              <Label>Type</Label>
              <Select
                value={attributeBaseType}
                disabled={editing}
                onValueChange={(value) => {
                  setAttributeBaseType(value as ValueTypeKeys);
                  setDefaultType('Value');
                }}
                data={[...ALL_TYPES]}
              />
              {attributeBaseType === 'set' && (
                <Select
                  value={setType}
                  disabled={editing}
                  onValueChange={(value) => {
                    setSetType(value as ValueTypeKeys);
                  }}
                  data={[...VALUE_TYPE_KEYS]}
                />
              )}
              {attributeBaseType === 'record' && (
                <div className="flex flex-col gap-3">
                  {Object.entries(recordKeyTypes).map(([key, [name, type]]) => (
                    <div key={key} className="flex flex-row gap-2 items-end">
                      <Input
                        label="Key"
                        placeholder="e.g. name"
                        value={name}
                        disabled={editing}
                        onChange={(e) => {
                          setRecordKeyTypes((prev) => {
                            const next = { ...prev };
                            next[key] = [e.target.value, type];
                            return next;
                          });
                        }}
                      />
                      <Select
                        label="Type"
                        disabled={editing}
                        value={type}
                        onValueChange={(type) => {
                          setRecordKeyTypes((prev) => {
                            const next = { ...prev };
                            next[key] = [name, type];
                            return next;
                          });
                        }}
                        data={[...VALUE_TYPE_KEYS]}
                      />
                      {!editing && (
                        <CloseButton
                          className="mb-2"
                          disabled={editing}
                          onClick={() => {
                            setRecordKeyTypes((prev) => {
                              const next = { ...prev };
                              delete next[key];
                              return next;
                            });
                          }}
                        />
                      )}
                    </div>
                  ))}

                  {!editing && (
                    <Button
                      onClick={() => {
                        setRecordKeyTypes((prev) => {
                          const next = { ...prev };
                          next[randomId()] = ['', 'string'];
                          return next;
                        });
                      }}
                    >
                      Add property
                    </Button>
                  )}
                </div>
              )}

              <div className="flex text-muted-foreground">
                The attribute type will be validated whenever an attribute's
                data is written or updated. It will also provide type hinting
                via TypeScript in the TriplitClient.
              </div>
            </div>
          </div>
          {attributeBaseType !== 'record' && (
            <>
              <hr className="col-span-full mt-10 mb-5" />
              <div className="font-bold">Options</div>
              <div className="flex flex-col gap-5 col-span-2">
                {attributeBaseType !== 'set' && (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-row items-center gap-3">
                      <Checkbox
                        className="w-5 h-5"
                        checked={hasDefault}
                        onCheckedChange={setHasDefault}
                      />
                      <div className="flex flex-row justify-between items-center w-full">
                        <Label>Default value</Label>
                        <div className="text-muted-foreground">Optional</div>
                      </div>
                    </div>
                    {hasDefault && (
                      <>
                        <div className="flex flex-row gap-2">
                          <Select
                            value={defaultType}
                            onValueChange={setDefaultType}
                            data={getDefaultOptionsFromType(attributeBaseType)}
                          />
                          {defaultType === 'Value' &&
                            attributeBaseType === 'string' && (
                              <Input
                                type="text"
                                value={defaultValue}
                                onChange={(e) => {
                                  setDefaultValue(e.target.value);
                                }}
                              />
                            )}
                          {defaultType === 'Value' &&
                            attributeBaseType === 'boolean' && (
                              <Select
                                data={['true', 'false']}
                                placeholder='e.g. "Hello", 9, null'
                                value={String(defaultValue)}
                                onValueChange={(value) => {
                                  setDefaultValue(value === 'false');
                                }}
                              />
                            )}
                          {defaultType === 'Value' &&
                            attributeBaseType === 'number' && (
                              <Input
                                type="number"
                                value={String(defaultValue)}
                                onChange={(e) => {
                                  setDefaultValue(e.target.valueAsNumber);
                                }}
                              />
                            )}
                          {defaultType === 'Value' &&
                            attributeBaseType === 'date' && (
                              <Input
                                type="datetime-local"
                                value={defaultValue}
                                onChange={(e) => {
                                  setDefaultValue(e.target.value);
                                }}
                              />
                            )}
                        </div>
                        <div className="text-muted-foreground">
                          A default value can either be a literal value e.g.{' '}
                          <Code>"Hello", 9, null</Code> or a Triplit-provided
                          function. If left empty, the attribute will be
                          undefined by default.
                        </div>
                      </>
                    )}
                  </div>
                )}
                <div className="flex flex-row items-center gap-3">
                  <Checkbox
                    className="w-5 h-5"
                    checked={nullable}
                    disabled={
                      attributeToUpdate && attributeToUpdate?.options?.nullable
                    }
                    onCheckedChange={setNullable}
                  />
                  <div className="flex flex-row justify-between items-center w-full">
                    <Label>Nullable</Label>
                    <div className="text-muted-foreground">Optional</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        <hr className="col-span-full mt-10 mb-5" />

        <SheetFooter>
          <Button variant={'outline'} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            // TODO: prevent attribute name conflicts as necessary
            disabled={attributeName === ''}
            variant={'default'}
            onClick={submitForm}
          >
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

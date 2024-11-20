import { Input, Checkbox } from '@triplit/ui';

export function CollectionSchemaDetail({ collectionSchema }) {
  const attributes = collectionSchema.schema?.properties;
  return (
    <div className="flex flex-col space-y-5 text-sm">
      <div className="grid grid-cols-4 text-xs gap-4 text-zinc-500">
        <div>Name</div>
        <div>Type</div>
        <div>Default value</div>
        <div>Nullable?</div>
      </div>
      {attributes &&
        Object.entries(attributes).map(([attribute, { type, options }]) => {
          const attributeType = type as string;
          const attributeIsNullable = options && options.nullable;
          const attributeDefault = attributeType.startsWith('set_')
            ? 'not applicable'
            : options.default === undefined
              ? 'unset'
              : typeof options.default === 'object'
                ? options.default.func
                : options.default;
          return (
            <div
              className="grid grid-cols-4 gap-4 items-center"
              key={attribute}
            >
              <Input className="" readOnly value={attribute} />
              <Input className="" readOnly value={attributeType} />
              <Input
                className={`${
                  ['unset', 'not applicable'].includes(attributeDefault)
                    ? 'text-zinc-500'
                    : ''
                }`}
                readOnly
                value={attributeDefault}
              />
              <Checkbox disabled checked={attributeIsNullable} />
            </div>
          );
        })}
    </div>
  );
}

import { EditingProtectedFieldError } from '../errors';

type ArgumentsType<T extends (...args: any[]) => any> = T extends (
  ...args: infer A
) => any
  ? A
  : never;

export type toBuilder<
  // The structure of the output data
  Data extends {},
  // The fields that cannot be edited
  ProtectedField extends keyof Data = never,
  // Field transformers
  CustomInputs extends {
    [key in keyof Omit<Required<Data>, ProtectedField>]: (
      ...args: any
    ) => Data[key];
  } = never
> = {
  [K in keyof Omit<Required<Data>, ProtectedField>]: (
    ...args: K extends keyof CustomInputs
      ? ArgumentsType<CustomInputs[K]>
      : [Data[K]]
  ) => toBuilder<Data, ProtectedField, CustomInputs>;
} & { build: () => Data };

export default function Builder<
  Data extends Object,
  ProtectedField extends keyof Data = never,
  CustomInputs extends {
    [key in keyof Omit<Partial<Data>, ProtectedField>]: (
      ...args: any
    ) => Data[key];
  } = never
>(
  initial: Data,
  {
    inputTransformers,
    protectedFields,
  }: {
    inputTransformers?: CustomInputs;
    protectedFields?: ProtectedField[];
  } = { protectedFields: [] }
): toBuilder<Data, ProtectedField, CustomInputs> {
  const data = initial;
  return new Proxy({} as toBuilder<Data, ProtectedField, CustomInputs>, {
    get: (_target, name) => {
      if (name === 'build') {
        return () => data;
      }
      if (protectedFields?.includes(name as ProtectedField)) {
        throw new EditingProtectedFieldError(String(name));
      }

      return (...args: any[]) => {
        let value = args[0];
        if (
          inputTransformers &&
          inputTransformers[name as keyof typeof inputTransformers]
        ) {
          value = inputTransformers[name as keyof CustomInputs](...args);
        }
        return Builder<Data, ProtectedField, CustomInputs>(
          { ...data, [name]: value },
          { protectedFields, inputTransformers }
        );
      };
    },
  });
}

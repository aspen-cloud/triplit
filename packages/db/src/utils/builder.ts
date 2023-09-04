export type toBuilder<
  Data extends {},
  ProtectedField extends keyof Data,
  CustomInputs extends {
    [key in keyof Omit<Required<Data>, ProtectedField>]: any;
  }
> = {
  [k in keyof Omit<Required<Data>, ProtectedField>]: (
    ...args: CustomInputs[k] extends undefined ? [Data[k]] : CustomInputs[k]
  ) => toBuilder<Data, ProtectedField, CustomInputs>;
} & { build: () => Data };

export default function Builder<
  Data extends Object,
  ProtectedField extends keyof Data,
  CustomInputs extends {
    [key in keyof Omit<Partial<Data>, ProtectedField>]: any;
  }
>(
  initial: Data,
  {
    inputTransformers,
    protectedFields,
  }: {
    inputTransformers?: {
      //@ts-ignore
      [key in keyof CustomInputs]: (...input: CustomInputs[key]) => Data[key];
    };
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
        throw new Error(`Cannot edit protected field: ${String(name)}`);
      }

      return (...args: any[]) => {
        let value = args[0];
        if (
          inputTransformers &&
          inputTransformers[name as keyof typeof inputTransformers]
        ) {
          // @ts-ignore
          value = inputTransformers[name as keyof CustomInputs](...args);
        }
        return Builder(
          { ...data, [name]: value },
          { protectedFields, inputTransformers }
        );
      };
    },
  });
}

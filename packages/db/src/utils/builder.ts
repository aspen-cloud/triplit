export type toBuilder<T extends {}, B extends {} = T> = {
  [k in keyof Required<B>]: (value: B[k]) => toBuilder<T, B>;
} & { build: () => T };

// TODO: add allowed methods to the builder to throw runtime errors
// when calling non-defined methods (i.e. query paramters for collectionQuery)
// T is the return object, B is what is exposed in the builder (should be a subset of T)
export default function Builder<T extends Object, B extends Object = T>(
  initial: T
): toBuilder<T, B> {
  const data = initial;
  return new Proxy({} as toBuilder<T, B>, {
    get: (_target, name) => {
      if (name === 'build') {
        return () => data;
      }
      return (newVal: any) => {
        return Builder({ ...data, [name]: newVal });
      };
    },
  });
}

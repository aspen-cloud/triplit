export type toBuilder<T extends {}> = {
  [k in keyof Required<T>]: (value: T[k]) => toBuilder<T>;
} & { build: () => T };

// TODO: add allowed methods to the builder to throw runtime errors
// when calling non-defined methods (i.e. query paramters for collectionQuery)
export default function Builder<T extends Object>(initial: T): toBuilder<T> {
  const data = initial;
  return new Proxy({} as toBuilder<T>, {
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

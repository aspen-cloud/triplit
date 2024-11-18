export function someAsync<T>(
  arr: T[],
  predicate: (value: T, i: number, arr: T[]) => Promise<boolean>
) {
  return arr.reduce(async (acc, value, i, arr) => {
    return (await acc) || (await predicate(value, i, arr));
  }, Promise.resolve(false));
}

export function everyAsync<T>(
  arr: T[],
  predicate: (value: T, i: number, arr: T[]) => Promise<boolean>
) {
  return arr.reduce(async (acc, value, i, arr) => {
    return (await acc) && (await predicate(value, i, arr));
  }, Promise.resolve(true));
}

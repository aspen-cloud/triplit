export function someAsync(
  arr: any[],
  predicate: (value: any, i: number, arr: any[]) => Promise<boolean>
) {
  return arr.reduce(async (acc, value, i, arr) => {
    return (await acc) || (await predicate(value, i, arr));
  }, Promise.resolve(false));
}

export function everyAsync(
  arr: any[],
  predicate: (value: any, i: number, arr: any[]) => Promise<boolean>
) {
  return arr.reduce(async (acc, value, i, arr) => {
    return (await acc) && (await predicate(value, i, arr));
  }, Promise.resolve(true));
}

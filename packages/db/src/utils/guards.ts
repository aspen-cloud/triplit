export function all<T>(
  arr: any[],
  predicate: (val: any) => val is T
): arr is T[] {
  return arr.every(predicate);
}

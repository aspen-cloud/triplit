export type Timestamp = [sequence: number, client: string];

export function timestampCompare(
  a: Timestamp | undefined,
  b: Timestamp | undefined
) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  return 0;
}

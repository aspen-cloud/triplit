import { compareValue, ValueCursor } from '@triplit/db';

export function compareCursors(
  cursor1: ValueCursor | undefined,
  cursor2: ValueCursor | undefined
) {
  if (!cursor1 && !cursor2) return 0;
  if (!cursor1) return -1;
  if (!cursor2) return 1;
  let cursor1Value = cursor1[0];
  let cursor2Value = cursor2[0];
  // TODO: encode cursor and use same cursor comparison from db package
  if (cursor1Value instanceof Date) cursor1Value = cursor1Value.getTime();
  if (cursor2Value instanceof Date) cursor2Value = cursor2Value.getTime();
  return compareValue(cursor1Value, cursor2Value);
}

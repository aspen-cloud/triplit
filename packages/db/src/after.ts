import type {
  PreparedOrder,
  QueryAfter,
  QueryOrder,
} from './query/types/index.js';
import { QueryNotPreparedError } from './errors.js';
import { ValuePointer } from './utils/value-pointer.js';
import { compareValue, MIN } from './codec.js';

export function satisfiesAfter(
  entity: any,
  after: QueryAfter,
  order?: PreparedOrder
): boolean {
  const [cursor, inclusive] = after;
  if (!order || order.length !== cursor.length) {
    throw new QueryNotPreparedError(
      'The order and after cursor are not compatible'
    );
  }
  // If no cursor items, default to pass
  let cursorPassed = true;
  for (let i = 0; i < cursor.length; i++) {
    const cursorVal = cursor[i];
    const orderAttr = order[i][0];
    const orderDir = order[i][1];
    const entityVal = ValuePointer.Get(entity, orderAttr) ?? MIN;
    const cmp =
      compareValue(entityVal, cursorVal) * (orderDir === 'ASC' ? 1 : -1);

    // if the value is less, we're before the cursor
    if (cmp < 0) {
      cursorPassed = false;
      break;
    }
    // if the value is greater, we're after the cursor
    if (cmp > 0) {
      cursorPassed = true;
      break;
    }

    // If all tied at end, make a decision based on inclusive
    if (i === cursor.length - 1) {
      cursorPassed = inclusive;
      break;
    }
  }
  return cursorPassed;
}

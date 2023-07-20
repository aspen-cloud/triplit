import { UpdateMutationTransaction } from '../mutation';
import { Value } from '../triple-store';

//operations
export async function set(tx: UpdateMutationTransaction, value: Value) {
  const { transactor, entity, attribute } = tx;
  return transactor.setValue(entity, attribute, value);
}

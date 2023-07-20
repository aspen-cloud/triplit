import { Attribute, EntityId, Value } from '../triple-store';
import SetType from '../data-types/set';
import { UpdateMutationTransaction } from '../mutation';

//operations
export async function add(tx: UpdateMutationTransaction, value: Value) {
  const { transactor, entity, attribute } = tx;
  const partialTriples = SetType.operations.add(value);
  const newTriples = partialTriples.map<[EntityId, Attribute, Value]>(
    ([attr, val]) => {
      return [entity, [...attribute, ...attr], val];
    }
  );
  for (const newTriple of newTriples) {
    return transactor.setValue(...newTriple);
  }
}

export async function remove(tx: UpdateMutationTransaction, value: Value) {
  const { transactor, entity, attribute } = tx;
  const partialTriples = SetType.operations.remove(value);
  const newTriples = partialTriples.map<[EntityId, Attribute, Value]>(
    ([attr, val]) => {
      return [entity, [...attribute, ...attr], val];
    }
  );
  for (const newTriple of newTriples) {
    return transactor.setValue(...newTriple);
  }
}

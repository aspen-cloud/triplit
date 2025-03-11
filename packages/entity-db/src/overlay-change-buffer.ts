import { DBEntity, Change, CollectionChanges } from './types.js';
import { deepObjectAssign } from './utils/deep-merge.js';

/**
 * Apply changes and deletions from the outbox to a primary entity
 *
 * @param primary - the entity from the primary store
 * @param hasDelete - whether the primary entity has been deleted
 * @param update - the update from the outbox
 * @returns
 */
export function applyOverlay(
  primary: DBEntity | undefined,
  hasDelete: boolean,
  update: Change | undefined
): DBEntity | undefined {
  if (!update && !hasDelete) return primary;

  if (primary) {
    // @ts-expect-error
    if (hasDelete) return update;
    return deepObjectAssign({}, primary, update);
  }
  // @ts-expect-error
  return update;
}

export async function* overlayChangesOnCollection(
  entities: AsyncIterable<DBEntity>,
  changes: CollectionChanges | undefined
): AsyncIterable<DBEntity> {
  // Get entities from base store
  if (!changes) {
    yield* entities;
    return;
  }
  const yielded = new Set<string>();
  for await (const entity of entities) {
    const id = entity.id;
    yielded.add(id);
    const overlaidEntity = applyOverlay(
      entity,
      changes.deletes.has(id),
      changes.sets.get(id)
    );
    if (!overlaidEntity) continue;
    yield overlaidEntity;
  }
  // Yield any remaining sets
  for (const [id, change] of changes.sets) {
    if (!yielded.has(id) && !changes.deletes.has(id)) {
      // TODO: handle prefixing
      // NOTE: change should be a full entity if it was not picked up in collection scan
      // TODO: deprecated prefix i think here?
      yield change as DBEntity;
    }
  }
}

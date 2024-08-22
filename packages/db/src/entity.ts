import { EntityData } from './query.js';

// TODO: Dont use any, should be timestamped entity type
export function isTimestampedEntityDeleted(entity: EntityData) {
  return entity && '_collection' in entity && entity['_collection'][0] == null;
}

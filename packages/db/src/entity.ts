// TODO: Dont use any, should be timestamped entity type
export function isTimestampedEntityDeleted(entity: any) {
  return (
    entity && '_collection' in entity && entity['_collection'][0] === undefined
  );
}

import { dbDocumentToTuples } from '../../../utils.js';
import { EAV } from '../../../triple-store-utils.js';
import { Models, StoreSchema } from '../../types/models.js';
import { schemaToJSON } from '../json/export.js';
import { appendCollectionToId } from '../../../db-helpers.js';

export function schemaToTriples(schema: StoreSchema<Models>): EAV[] {
  const schemaData = schemaToJSON(schema);
  const tuples = dbDocumentToTuples(schemaData);
  const id = appendCollectionToId('_metadata', '_schema');

  // Not sure if this is the best place to do it, but a schema is treated as an entity so needs extra entity triples
  const collectionTuple = [id, ['_collection'], '_metadata'] as EAV;
  const idTuple = [id, ['_metadata', 'id'], '_schema'] as EAV;

  return [
    collectionTuple,
    idTuple,
    ...tuples.map((tuple) => {
      return [id, ['_metadata', ...tuple[0]], tuple[1]] as EAV;
    }),
  ];
}

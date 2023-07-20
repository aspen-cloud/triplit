import { Model } from './schema';
import { TripleStore } from './triple-store';

export default class Entity<M extends Model<any>> {
  store: TripleStore;
  collectionName: string;
  model: M;
  id: string;
  constructor({
    store,
    collectionName,
    model,
    entityId,
  }: {
    store: TripleStore;
    collectionName: string;
    model: M;
    entityId: string;
  }) {
    this.store = store;
    this.collectionName = collectionName;
    this.model = model;
    this.id = entityId;
  }

  prop(propPath: keyof M['properties']) {
    if (this.model.properties[propPath]['x-crdt-type'] === 'Set') {
      return {
        add: () => {},
        remove: () => {},
      };
    } else {
      return {
        set: () => {},
      };
    }
  }
}

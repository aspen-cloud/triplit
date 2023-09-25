import { Model } from './schema';
import { TripleStore } from './triple-store';

// TODO: deprecated?
export default class Entity<M extends Model> {
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

  prop(propPath: keyof M) {
    if (this.model[propPath].type === 'set') {
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

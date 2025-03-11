import { HybridLogicalClock } from './hybrid-clock.js';
import { EntityStoreKV } from './entity-store.js';

export class ServerEntityStore extends EntityStoreKV {
  clock: HybridLogicalClock;
  constructor(...args: ConstructorParameters<typeof EntityStoreKV>) {
    super(...args);
    this.clock = new HybridLogicalClock({ clientId: 'server' });
  }

  applyChanges(
    ...args: Parameters<EntityStoreKV['applyChanges']>
  ): ReturnType<EntityStoreKV['applyChanges']> {
    return super.applyChangesWithTimestamp(
      args[0],
      args[1],
      this.clock.next(),
      args[2]
    );
  }
}

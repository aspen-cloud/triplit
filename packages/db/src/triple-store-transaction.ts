import { Timestamp } from './timestamp.js';
import { MultiTupleTransaction, StorageScope } from './multi-tuple-store.js';
import { Clock } from './clocks/clock.js';
import { ValueCursor } from './query.js';
import {
  TripleStoreApi,
  TripleStoreTxOperator,
  TupleIndex,
  TripleStore,
  TripleStoreHooks,
  TripleRow,
  EAV,
  EntityId,
  Attribute,
  Value,
  TripleStoreBeforeInsertHook,
  TripleStoreBeforeCommitHook,
} from './triple-store.js';

export class TripleStoreTransaction implements TripleStoreApi {
  private operator: TripleStoreTxOperator;
  tupleTx: MultiTupleTransaction<TupleIndex>;
  store: TripleStore;
  readonly clock: Clock;
  hooks: TripleStoreHooks;
  assignedTimestamp?: Timestamp;

  constructor({
    store,
    tupleTx,
    clock,
    hooks,
  }: {
    store: TripleStore;
    tupleTx: MultiTupleTransaction<TupleIndex>;
    clock: Clock;
    hooks: TripleStoreHooks;
  }) {
    this.clock = clock;
    this.hooks = hooks;
    this.operator = new TripleStoreTxOperator({
      parentTx: this,
      tupleOperator: tupleTx,
      clock,
      hooks,
    });
    this.store = store;
    this.tupleTx = tupleTx;
  }

  insertTriple(tripleRow: TripleRow): Promise<void> {
    return this.operator.insertTriple(tripleRow);
  }

  insertTriples(triplesInput: TripleRow[]): Promise<void> {
    return this.operator.insertTriples(triplesInput);
  }

  deleteTriple(tripleRow: TripleRow): Promise<void> {
    return this.operator.deleteTriple(tripleRow);
  }

  deleteTriples(triplesInput: TripleRow[]): Promise<void> {
    return this.operator.deleteTriples(triplesInput);
  }

  setValue(...value: EAV): Promise<void> {
    return this.operator.setValue(...value);
  }

  setValues(values: EAV[]): Promise<void> {
    return this.operator.setValues(values);
  }

  expireEntity(id: EntityId): Promise<void> {
    return this.operator.expireEntity(id);
  }

  expireEntityAttribute(id: EntityId, attribute: Attribute): Promise<void> {
    return this.operator.expireEntityAttribute(id, attribute);
  }

  expireEntityAttributes(
    values: { id: EntityId; attribute: Attribute }[]
  ): Promise<void> {
    return this.operator.expireEntityAttributes(values);
  }

  findByCollection(
    collection: string,
    direction?: 'ASC' | 'DESC' | undefined
  ): Promise<TripleRow[]> {
    return this.operator.findByCollection(collection, direction);
  }

  findMaxClientTimestamp(clientId: string): Promise<Timestamp | undefined> {
    return this.operator.findMaxClientTimestamp(clientId);
  }

  findByClientTimestamp(
    clientId: string,
    scanDirection: 'lt' | 'lte' | 'gt' | 'gte',
    timestamp: Timestamp | undefined
  ): Promise<TripleRow[]> {
    return this.operator.findByClientTimestamp(
      clientId,
      scanDirection,
      timestamp
    );
  }

  findByEAT(
    eav: [entityId?: string | undefined, attribute?: Attribute | undefined],
    direction?: 'ASC' | 'DESC' | undefined
  ): Promise<TripleRow[]> {
    return this.operator.findByEAT(eav, direction);
  }

  findByAVE(
    ave: [
      attribute?: Attribute | undefined,
      value?: Value | undefined,
      entityId?: string | undefined
    ],
    direction?: 'ASC' | 'DESC' | undefined
  ): Promise<TripleRow[]> {
    return this.operator.findByAVE(ave, direction);
  }

  findByEntity(id?: string | undefined): Promise<TripleRow[]> {
    return this.operator.findByEntity(id);
  }

  findByEntityAttribute(
    id: string,
    attribute: Attribute
  ): Promise<TripleRow[]> {
    return this.operator.findByEntityAttribute(id, attribute);
  }

  findByAttribute(attribute: Attribute): Promise<TripleRow[]> {
    return this.operator.findByAttribute(attribute);
  }

  readMetadataTuples(
    entityId: string,
    attribute?: Attribute | undefined
  ): Promise<EAV[]> {
    return this.operator.readMetadataTuples(entityId, attribute);
  }

  updateMetadataTuples(updates: EAV[]): Promise<void> {
    return this.operator.updateMetadataTuples(updates);
  }

  deleteMetadataTuples(
    deletes: [entityId: string, attribute?: Attribute | undefined][]
  ): Promise<void> {
    return this.operator.deleteMetadataTuples(deletes);
  }

  findValuesInRange(
    attribute: Attribute,
    constraints:
      | {
          greaterThan?: ValueCursor | undefined;
          lessThan?: ValueCursor | undefined;
          direction?: 'ASC' | 'DESC' | undefined;
        }
      | undefined
  ): Promise<TripleRow[]> {
    return this.operator.findValuesInRange(attribute, constraints);
  }

  async commit(): Promise<void> {
    await this.tupleTx.commit();
  }

  async cancel(): Promise<void> {
    await this.tupleTx.cancel();
  }

  withScope(scope: StorageScope) {
    return new TripleStoreTxOperator({
      parentTx: this,
      tupleOperator: this.tupleTx.withScope(scope),
      clock: this.clock,
      hooks: this.hooks,
    });
  }

  beforeInsert(callback: TripleStoreBeforeInsertHook) {
    this.hooks.beforeInsert.push(callback);
  }

  beforeCommit(callback: TripleStoreBeforeCommitHook) {
    this.tupleTx.hooks.beforeCommit.push(() => callback(this));
  }

  async getTransactionTimestamp() {
    if (!this.assignedTimestamp) {
      this.assignedTimestamp = await this.clock.getNextTimestamp();
    }
    return this.assignedTimestamp;
  }
}

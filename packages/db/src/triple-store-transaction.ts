import { Timestamp, timestampCompare } from './timestamp.js';
import {
  MultiTupleTransaction,
  ScopedMultiTupleOperator,
  StorageScope,
} from './multi-tuple-store.js';
import { Clock } from './clocks/clock.js';
import { ValueCursor } from './query.js';
import { TripleStoreApi } from './triple-store.js';
import { InvalidTripleStoreValueError } from './errors.js';
import {
  TupleIndex,
  MetadataListener,
  TripleStoreHooks,
  TripleRow,
  findByCollection,
  Attribute,
  findValuesInRange,
  findByEAT,
  findByAVE,
  findByEntity,
  findByEntityAttribute,
  findByAttribute,
  findMaxClientTimestamp,
  findByClientTimestamp,
  mapStaticTupleToEAV,
  EAV,
  EntityId,
  Value,
  TripleStoreBeforeCommitHook,
  TripleStoreBeforeInsertHook,
} from './triple-store-utils.js';

export class TripleStoreTransaction implements TripleStoreApi {
  tupleTx: MultiTupleTransaction<TupleIndex>;
  private txMetadataListeners: Set<MetadataListener> = new Set();
  assignedTimestamp?: Timestamp;

  readonly clock: Clock;

  hooks: TripleStoreHooks;

  constructor({
    tupleTx,
    clock,
    hooks,
  }: {
    tupleTx: MultiTupleTransaction<TupleIndex>;
    clock: Clock;
    hooks: TripleStoreHooks;
  }) {
    this.tupleTx = tupleTx;
    this.clock = clock;
    this.hooks = hooks;
  }

  async getTransactionTimestamp() {
    if (!this.assignedTimestamp) {
      this.assignedTimestamp = await this.clock.getNextTimestamp();
    }
    return this.assignedTimestamp;
  }

  async findByCollection(
    collection: string,
    direction?: 'ASC' | 'DESC' | undefined
  ): Promise<TripleRow[]> {
    return findByCollection(this.tupleTx, collection, direction);
  }

  async findValuesInRange(
    attribute: Attribute,
    constraints:
      | {
          greaterThan?: ValueCursor;
          lessThan?: ValueCursor;
          direction?: 'ASC' | 'DESC';
        }
      | undefined
  ) {
    return findValuesInRange(this.tupleTx, attribute, constraints);
  }

  async findByEAT(
    tupleArgs: [
      entityId?: string | undefined,
      attribute?: Attribute | undefined
    ],
    direction?: 'ASC' | 'DESC' | undefined
  ): Promise<TripleRow[]> {
    return findByEAT(this.tupleTx, tupleArgs, direction);
  }
  findByAVE(
    tupleArgs: [
      attribute?: Attribute | undefined,
      value?: Value | undefined,
      entityId?: string | undefined
    ],
    direction?: 'ASC' | 'DESC' | undefined
  ): Promise<TripleRow[]> {
    return findByAVE(this.tupleTx, tupleArgs, direction);
  }

  async findByEntity(id?: string | undefined): Promise<TripleRow[]> {
    return findByEntity(this.tupleTx, id);
  }
  async findByEntityAttribute(
    id: string,
    attribute: Attribute
  ): Promise<TripleRow[]> {
    return findByEntityAttribute(this.tupleTx, id, attribute);
  }
  async findByAttribute(attribute: Attribute): Promise<TripleRow[]> {
    return findByAttribute(this.tupleTx, attribute);
  }

  findMaxClientTimestamp(clientId: string) {
    return findMaxClientTimestamp(this.tupleTx, clientId);
  }

  findByClientTimestamp(
    clientId: string,
    scanDirection: 'lt' | 'lte' | 'gt' | 'gte' | 'eq',
    timestamp: Timestamp | undefined
  ) {
    return findByClientTimestamp(
      this.tupleTx,
      clientId,
      scanDirection,
      timestamp
    );
  }

  async insertTriple(tripleRow: TripleRow): Promise<void> {
    await this.insertTriples([tripleRow]);
  }

  async insertTriples(triplesInput: TripleRow[]): Promise<void> {
    if (!triplesInput.length) return;
    for (const hook of this.hooks.beforeInsert) {
      await hook(triplesInput, this);
    }
    for (const triple of triplesInput) {
      if (triple.value === undefined) {
        throw new InvalidTripleStoreValueError(undefined);
      }
      await this.addTripleToIndex(this.tupleTx, triple);
    }
  }

  private async addTripleToIndex(
    tx: ScopedMultiTupleOperator<TupleIndex>,
    tripleInput: TripleRow
  ) {
    const { id: id, attribute, value, timestamp, expired } = tripleInput;

    // If we already have this triple, skip it (performance optimization)
    // const existingTriples = await tx.scan({
    //   prefix: ['EAT', id, attribute, value, timestamp],
    // });
    // if (existingTriples.length > 1) {
    //   throw new TriplitError(
    //     'Found multiple tuples with the same key. This should not happen.'
    //   );
    // }
    // if (existingTriples.length === 1) {
    //   const existingTriple = indexToTriple(existingTriples[0]);
    //   if (existingTriple.expired === expired) {
    //     // console.info('Skipping index for existing triple');
    //     return;
    //   }
    // }

    tx.set(['EAT', id, attribute, timestamp], [value, expired]);
  }

  async deleteTriple(trip: TripleRow) {
    this.deleteTriples([trip]);
  }

  async deleteTriples(triples: TripleRow[]) {
    const tx = this.tupleTx;
    for (const triple of triples) {
      const { id: id, attribute, value, timestamp } = triple;
      tx.remove(['EAT', id, attribute, timestamp]);
      tx.remove(['AVE', attribute, value, id, timestamp]);
      // tx.remove(['VAE', value, attribute, id, timestamp]);
      tx.remove([
        'clientTimestamp',
        timestamp[1],
        timestamp,
        id,
        attribute,
        value,
      ]);
    }
  }

  async readMetadataTuples(entityId: string, attribute?: Attribute) {
    const tuples = await this.tupleTx.scan({
      prefix: ['metadata', entityId, ...(attribute ?? [])],
    });

    return tuples.map(mapStaticTupleToEAV);
  }

  async updateMetadataTuples(updates: EAV[]) {
    for (const [entityId, attribute, value] of updates) {
      this.tupleTx.set(['metadata', entityId, ...attribute], value);
    }
    await Promise.all(
      [...this.txMetadataListeners].map((cb) => cb({ updates, deletes: [] }))
    );
  }

  async deleteMetadataTuples(
    deletes: [entityId: string, attribute?: Attribute][]
  ) {
    for (const [entityId, attribute] of deletes) {
      (
        await this.tupleTx.scan({
          prefix: ['metadata', entityId, ...(attribute ?? [])],
        })
      ).forEach((tuple) => this.tupleTx.remove(tuple.key));
    }
    await Promise.all(
      [...this.txMetadataListeners].map((cb) => cb({ updates: [], deletes }))
    );
  }

  onMetadataChange(callback: MetadataListener) {
    this.txMetadataListeners.add(callback);
    return () => {
      this.txMetadataListeners.delete(callback);
    };
  }

  async setValue(id: EntityId, attribute: Attribute, value: Value) {
    return await this.setValues([[id, attribute, value]]);
  }

  async setValues(eavs: EAV[]) {
    if (!eavs.length) return;
    const txTimestamp = await this.getTransactionTimestamp();
    const toInsert: TripleRow[] = [];
    for (const eav of eavs) {
      const [id, attribute, value] = eav;
      if (value === undefined) {
        throw new InvalidTripleStoreValueError(undefined);
      }
      const existingTriples = await this.findByEntityAttribute(id, attribute);
      const newerTriples = existingTriples.filter(
        ({ timestamp }) => timestampCompare(timestamp, txTimestamp) === 1
      );
      if (newerTriples.length === 0) {
        toInsert.push({
          id,
          attribute,
          value,
          timestamp: txTimestamp,
          expired: false,
        });
      }
    }
    await this.insertTriples(toInsert);
  }

  async expireEntity(id: EntityId) {
    // const timestamp = await this.parentTx.getTransactionTimestamp();
    // const collectionTriple = await this.findByEntityAttribute(id, [
    //   '_collection',
    // ]);
    // const existingTriples = await this.findByEntity(id);
    // await this.insertTriples(
    //   collectionTriple.map((t) => ({ ...t, timestamp, expired: true }))
    // );
    // await this.setValue(id, ['_collection'], null);
    await this.expireEntityAttribute(id, ['_collection']);

    // Perform local garbage collection
    // Feels like it would be nice to do GC in hooks...tried once and it was a bit messy with other assumptions
    // await this.deleteTriples(existingTriples);
  }

  async expireEntityAttribute(id: EntityId, attribute: Attribute) {
    return this.expireEntityAttributes([{ id, attribute }]);
  }

  async expireEntityAttributes(
    values: { id: EntityId; attribute: Attribute }[]
  ) {
    const allExistingTriples: TripleRow[] = [];
    for (const { id, attribute } of values) {
      const existingTriples = await this.findByEntityAttribute(id, attribute);
      allExistingTriples.push(...existingTriples);
    }
    const timestamp = await this.getTransactionTimestamp();
    await this.deleteTriples(allExistingTriples);
    await this.insertTriples(
      allExistingTriples.map(({ id, attribute }) => ({
        id,
        attribute,
        value: null,
        timestamp,
        expired: true,
      }))
    );
  }

  async commit(): Promise<void> {
    await this.tupleTx.commit();
  }

  async cancel(): Promise<void> {
    await this.tupleTx.cancel();
  }

  withScope(scope: StorageScope) {
    return new TripleStoreTransaction({
      // @ts-expect-error
      tupleTx: this.tupleTx.withScope(scope),
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
}

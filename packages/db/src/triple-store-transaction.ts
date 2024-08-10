import { Timestamp, timestampCompare } from './timestamp.js';
import {
  MultiTupleTransaction,
  ScopedMultiTupleOperator,
  StorageScope,
} from './multi-tuple-store.js';
import { Clock } from './clocks/clock.js';
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
  TupleValue,
  TripleStoreBeforeCommitHook,
  TripleStoreBeforeInsertHook,
  TripleStoreAfterCommitHook,
  indexToTriple,
  findAllClientIds,
  RangeContraints,
} from './triple-store-utils.js';
import { copyHooks } from './utils.js';
import { MirroredArray } from './utils/mirrored-array.js';

function extractTriplesFromTx(tx: MultiTupleTransaction<TupleIndex>) {
  return Object.fromEntries(
    Object.entries(tx.txs).map(([key, tx]) => {
      return [
        key,
        tx.writes.set
          .filter((t) => t.key[1] === 'EAT')
          .map((i) => indexToTriple(i, ['client'])),
      ];
    })
  );
}

export class TripleStoreTransaction implements TripleStoreApi {
  tupleTx: MultiTupleTransaction<TupleIndex>;
  private txMetadataListeners: Set<MetadataListener> = new Set();
  assignedTimestamp?: Timestamp;

  readonly clock: Clock;

  readonly hooks: TripleStoreHooks;
  private _inheritedHooks: TripleStoreHooks;
  private _ownHooks: TripleStoreHooks;

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
    this._inheritedHooks = hooks ?? {
      beforeCommit: [],
      beforeInsert: [],
      afterCommit: [],
    };
    this._ownHooks = {
      beforeCommit: [],
      beforeInsert: [],
      afterCommit: [],
    };
    this.hooks = {
      beforeCommit: MirroredArray(
        this._inheritedHooks.beforeCommit,
        this._ownHooks.beforeCommit
      ),
      beforeInsert: MirroredArray(
        this._inheritedHooks.beforeInsert,
        this._ownHooks.beforeInsert
      ),
      afterCommit: MirroredArray(
        this._inheritedHooks.afterCommit,
        this._ownHooks.afterCommit
      ),
    };

    // register tuple store hooks
    this.hooks.beforeCommit.forEach((hook) => {
      this.tupleTx.beforeCommit((tx) => {
        const triples = extractTriplesFromTx(tx);
        return hook(triples, this);
      });
    });
    this.hooks.afterCommit.forEach((hook) => {
      this.tupleTx.afterCommit((tx) => {
        const triples = extractTriplesFromTx(tx);
        return hook(triples, this);
      });
    });
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
    constraints: RangeContraints | undefined
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
      value?: TupleValue | undefined,
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

  findAllClientIds(): Promise<string[]> {
    return findAllClientIds(this.tupleTx);
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
    await this.deleteTriples([trip]);
  }

  async deleteTriples(triples: TripleRow[]) {
    const tx = this.tupleTx;
    for (const triple of triples) {
      const { id: id, attribute, value, timestamp } = triple;
      tx.remove(['EAT', id, attribute, timestamp]);
      tx.remove(['AVE', attribute, value, id, timestamp]);
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

  async setValue(id: EntityId, attribute: Attribute, value: TupleValue) {
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
    const existingTriples = await this.findByEntity(id);
    // reduce triples to just the highest timestamp for each attribute
    const attributeTimestamps = new Map<string, TripleRow>();
    for (const triple of existingTriples) {
      const attributeKey = JSON.stringify(triple.attribute);
      const currentTimestamp = attributeTimestamps.get(attributeKey)?.timestamp;
      if (
        !currentTimestamp ||
        timestampCompare(triple.timestamp, currentTimestamp) > 0
      ) {
        attributeTimestamps.set(attributeKey, triple);
      }
    }
    await this.expireEntityAttributes(
      [...attributeTimestamps.values()].map(({ attribute, id }) => ({
        id,
        attribute,
      }))
    );
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
      for (const triple of existingTriples) {
        allExistingTriples.push(triple);
      }
    }
    const timestamp = await this.getTransactionTimestamp();
    // We need to overwrite any existing writes to that attribute that
    // occurred in the same TX (i.e. same timestamp)
    // normally the EAT index would take care of this but this needs to handle
    // deleting entire nested objects in schemaless mode
    await this.deleteTriples(
      allExistingTriples.filter(
        (t) => timestampCompare(t.timestamp, timestamp) === 0
      )
    );
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

  get isCanceled() {
    return this.tupleTx.isCanceled;
  }

  withScope(scope: StorageScope) {
    return new TripleStoreTransaction({
      // @ts-expect-error
      tupleTx: this.tupleTx.withScope(scope),
      clock: this.clock,
      hooks: copyHooks(this.hooks),
    });
  }

  beforeInsert(callback: TripleStoreBeforeInsertHook) {
    this._ownHooks.beforeInsert.push(callback);
  }

  beforeCommit(callback: TripleStoreBeforeCommitHook) {
    this.tupleTx.beforeCommit((tx) => callback(extractTriplesFromTx(tx), this));
  }

  afterCommit(callback: TripleStoreAfterCommitHook) {
    this.tupleTx.afterCommit((tx) => callback(extractTriplesFromTx(tx), this));
  }
}

import {
  AsyncTupleDatabaseClient,
  AsyncTupleStorageApi,
  MAX,
  MIN,
  WriteOps,
  KeyValuePair,
  AsyncTupleDatabase,
  TupleStorageApi,
} from 'tuple-database';
import {
  Models,
  getSchemaFromPath,
  triplesToSchema,
  schemaToTriples,
} from './schema';
import { Timestamp, timestampCompare } from './timestamp';
import { Value as SchemaValue } from '@sinclair/typebox/value';
import MultiTupleStore, {
  MultiTupleTransaction,
  ScopedMultiTupleOperator,
  StorageScope,
} from './multi-tuple-store';
import { Clock } from './clocks/clock';
import { MemoryClock } from './clocks/memory-clock';
import { entityToResultReducer, ValueCursor } from './query';

export type StoreSchema<M extends Models<any, any> | undefined> =
  M extends Models<any, any>
    ? {
        version: number;
        collections: M;
      }
    : M extends undefined
    ? undefined
    : never;

export type Value = number | string | boolean | null;
export type EntityId = string;
export type AttributeItem = string | number;
export type Attribute = AttributeItem[];
export type Expired = boolean;
export type TenantId = string;

export type EAV = [EntityId, Attribute, Value];
export type TripleKey = [EntityId, Attribute, Value, Timestamp];
export type TripleRow = {
  id: EntityId;
  attribute: Attribute;
  value: Value;
  timestamp: Timestamp;
  expired: Expired;
};

export type TripleMetadata = { expired: Expired };

export type EntIndex = {
  key: ['Entity', EntityId];
  value: any;
};

export type EAVIndex = {
  key: ['EAV', EntityId, Attribute, Value, Timestamp];
  value: TripleMetadata;
};

export type AVEIndex = {
  key: ['AVE', Attribute, Value, EntityId, Timestamp];
  value: TripleMetadata;
};

export type VAEIndex = {
  key: ['VAE', Value, Attribute, EntityId, Timestamp];
  value: TripleMetadata;
};

export type ClientTimestampIndex = {
  key: ['clientTimestamp', string, Timestamp, EntityId, Attribute, Value]; // [tenant, 'clientTimestamp', client]
  value: TripleMetadata;
};

export type MetadataIndex = {
  key: ['metadata', EntityId, ...Attribute];
  value: any;
};

type WithTenantIdPrefix<T extends KeyValuePair> = {
  key: [TenantId, ...T['key']];
  value: T['value'];
};

export type TripleIndex = EAVIndex | AVEIndex | VAEIndex | ClientTimestampIndex;
type TupleIndex = TripleIndex | MetadataIndex;
// export type TenantTripleIndex = WithTenantIdPrefix<TripleIndex>;

type MultiTupleStoreOrTransaction =
  | ScopedMultiTupleOperator<TupleIndex>
  | MultiTupleStore<TupleIndex>;

function indexToTriple(index: TupleIndex): TripleRow {
  const indexType = index.key[0];
  let e, a, v, t;
  switch (indexType) {
    case 'EAV':
      [, e, a, v, t] = index.key as EAVIndex['key'];
      break;
    case 'AVE':
      [, a, v, e, t] = index.key as AVEIndex['key'];
      break;
    // case 'VAE':
    //   [, v, a, e, t] = index.key as VAEIndex['key'];
    //   break;
    case 'clientTimestamp':
      [, , t, e, a, v] = index.key as ClientTimestampIndex['key'];
      break;
    default:
      throw new Error('unsupported index');
  }
  return {
    id: e,
    attribute: a,
    value: v,
    timestamp: t,
    expired: index.value.expired,
  };
}

function isTupleStorage(object: any): object is AsyncTupleStorageApi {
  if (typeof object !== 'object') return false;
  const storageKeys: (keyof AsyncTupleStorageApi)[] = [
    'close',
    'commit',
    'scan',
  ];
  return storageKeys.every((objKey) => objKey in object);
}

export interface TripleStoreApi {
  // Mutation methods
  insertTriple(tripleRow: TripleRow): void;
  insertTriples(triplesInput: TripleRow[]): void;
  deleteTriple(tripleRow: TripleRow): void;
  deleteTriples(triplesInput: TripleRow[]): void;
  setValue(...triple: EAV): void;

  // Read methods
  findByCollection(
    collection: string,
    direction?: 'ASC' | 'DESC'
  ): Promise<TripleRow[]>;
  findMaxTimestamp(clientId: string): Promise<Timestamp | undefined>;
  findByClientTimestamp(
    clientId: string,
    scanDirection: 'lt' | 'lte' | 'gt' | 'gte',
    timestamp: Timestamp | undefined
  ): Promise<TripleRow[]>;

  findByEAV(
    [entityId, attribute, value]: [
      entityId?: EntityId,
      attribute?: Attribute,
      value?: Value
    ],
    direction?: 'ASC' | 'DESC'
  ): Promise<TripleRow[]>;

  findByAVE(
    [attribute, value, entityId]: [
      attribute?: Attribute,
      value?: Value,
      entityId?: EntityId
    ],
    direction?: 'ASC' | 'DESC'
  ): Promise<TripleRow[]>;

  // findByVAE(
  //   [value, attribute, entityId]: [
  //     value?: Value,
  //     attribute?: Attribute,
  //     entityId?: EntityId
  //   ],
  //   direction?: 'ASC' | 'DESC'
  // ): Promise<TripleRow[]>;

  findByEntity(id?: EntityId): Promise<TripleRow[]>;

  findByEntityAttribute(
    id: EntityId,
    attribute: Attribute
  ): Promise<TripleRow[]>;

  findByAttribute(attribute: Attribute): Promise<TripleRow[]>;

  // findByValue(value: Value): Promise<TripleRow[]>;

  // metadata operations
  readMetadataTuples(entityId: string, attribute?: Attribute): Promise<EAV[]>;
  updateMetadataTuples(updates: EAV[]): Promise<void>;
  deleteMetadataTuples(
    deletes: [entityId: string, attribute?: Attribute][]
  ): Promise<void>;
  readSchema(): Promise<StoreSchema<Models<any, any>> | undefined>;
}

type MetadataListener = (changes: {
  updates: EAV[];
  deletes: [entityId: string, attribute?: Attribute][];
}) => void | Promise<void>;

export class TripleStoreOperator implements TripleStoreApi {
  tupleOperator: ScopedMultiTupleOperator<TupleIndex>;
  private txMetadataListeners: Set<MetadataListener> = new Set();

  schema?: StoreSchema<Models<any, any>>;
  clock: Clock;

  constructor({
    tupleOperator,
    schema,
    clock,
  }: {
    tupleOperator: ScopedMultiTupleOperator<TupleIndex>;
    clock: Clock;
    schema?: StoreSchema<Models<any, any>>;
  }) {
    this.tupleOperator = tupleOperator;
    // this.schema = schema;
    this.clock = clock;
    // This is probably not needed but currently doesn't work because there is no `subscribe`
    // on the tuple transaction api
    // syncClockWithStore(clock, this);

    // When updating schema tuples, we need to update the schema object for this tx
    // Tuple-database doesnt support listening to non commited writes, so manually listening
    // this.schema = this.readSchema();
    this.schema = schema;
    this.onMetadataChange(async ({ updates, deletes }) => {
      if (
        updates.some((u) => u[0] === '_schema') ||
        deletes.some((d) => d[0] === '_schema')
      ) {
        this.schema = await this.readSchemaFromStorage();
      }
    });
  }

  async readSchema() {
    return this.schema;
  }

  private async readSchemaFromStorage() {
    const schemaTriples = await this.readMetadataTuples('_schema');
    // At some point we probably want to validate the we extract (ie has expected props)
    if (!schemaTriples.length) return undefined;
    return triplesToSchema(schemaTriples);
  }

  async findByCollection(
    collection: string,
    direction?: 'ASC' | 'DESC' | undefined
  ): Promise<TripleRow[]> {
    return findByCollection(this.tupleOperator, collection, direction);
  }

  async findValuesInRange(
    attribute: Attribute,
    constraints:
      | {
          greaterThan?: any;
          lessThan?: any;
          direction?: 'ASC' | 'DESC';
        }
      | undefined
  ) {
    return findValuesInRange(this.tupleOperator, attribute, constraints);
  }

  async findByEAV(
    tupleArgs: [
      entityId?: string | undefined,
      attribute?: Attribute | undefined,
      value?: Value | undefined
    ],
    direction?: 'ASC' | 'DESC' | undefined
  ): Promise<TripleRow[]> {
    return findByEAV(this.tupleOperator, tupleArgs, direction);
  }
  findByAVE(
    tupleArgs: [
      attribute?: Attribute | undefined,
      value?: Value | undefined,
      entityId?: string | undefined
    ],
    direction?: 'ASC' | 'DESC' | undefined
  ): Promise<TripleRow[]> {
    return findByAVE(this.tupleOperator, tupleArgs, direction);
  }
  // findByVAE(
  //   tupleArgs: [
  //     value?: Value | undefined,
  //     attribute?: Attribute | undefined,
  //     entityId?: string | undefined
  //   ],
  //   direction?: 'ASC' | 'DESC' | undefined
  // ): Promise<TripleRow[]> {
  //   return findByVAE(this.tupleOperator, tupleArgs, direction);
  // }
  async findByEntity(id?: string | undefined): Promise<TripleRow[]> {
    return findByEntity(this.tupleOperator, id);
  }
  async findByEntityAttribute(
    id: string,
    attribute: Attribute
  ): Promise<TripleRow[]> {
    return findByEntityAttribute(this.tupleOperator, id, attribute);
  }
  async findByAttribute(attribute: Attribute): Promise<TripleRow[]> {
    return findByAttribute(this.tupleOperator, attribute);
  }
  // async findByValue(value: Value): Promise<TripleRow[]> {
  //   return findByValue(this.tupleOperator, value);
  // }

  getEntity(entityId: string) {
    return getEntity(this.tupleOperator, entityId);
  }

  getEntities(collectionName: string) {
    return getEntities(this.tupleOperator, collectionName);
  }

  // async commit(): Promise<void> {
  //   if (this.isCanceled) {
  //     console.warn('Cannot commit already canceled transaction.');
  //     return;
  //   }
  //   await this.tupleOperator.commit();
  // }

  // async cancel(): Promise<void> {
  //   if (this.isCanceled) {
  //     console.warn('Attempted to cancel already canceled transaction.');
  //     return;
  //   }
  //   await this.tupleOperator.cancel();
  //   this.isCanceled = true;
  // }

  findMaxTimestamp(clientId: string) {
    return findMaxTimestamp(this.tupleOperator, clientId);
  }

  findByClientTimestamp(
    clientId: string,
    scanDirection: 'lt' | 'lte' | 'gt' | 'gte',
    timestamp: Timestamp | undefined
  ) {
    return findByClientTimestamp(
      this.tupleOperator,
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
    for (const triple of triplesInput) {
      await this.addTripleToIndex(this.tupleOperator, triple);
    }
  }

  private async addTripleToIndex(
    tx: ScopedMultiTupleOperator<TupleIndex>,
    tripleInput: TripleRow
  ) {
    const { id: id, attribute, value, timestamp, expired } = tripleInput;

    if (expired) {
      console.info('Skipping index for expired triple');
      return;
    }

    // If we already have this triple, skip it (performance optimization)
    // This does add another binary search, so might be worth patching tuple-db to let us do this in tx.set()
    if (await tx.exists(['EAV', id, attribute, value, timestamp])) {
      console.warn("inserting triple that's already in the db");
      return;
    }

    const schema = await this.readSchema();
    if (schema) {
      try {
        validateTriple(schema.collections, attribute, value);
      } catch (e) {
        // console.error(e);
        // this.cancel();
        throw e;
      }
    }

    const metadata = { expired };

    await updateEntityIndex(tx, tripleInput);
    // TODO add check for existing entity/attribute pair
    tx.set(['EAV', id, attribute, value, timestamp], metadata);
    tx.set(['AVE', attribute, value, id, timestamp], metadata);
    // tx.set(['VAE', value, attribute, id, timestamp], metadata);
    tx.set(
      ['clientTimestamp', timestamp[1], timestamp, id, attribute, value],
      metadata
    );
  }

  async deleteTriple(trip: TripleRow) {
    this.deleteTriples([trip]);
  }

  async deleteTriples(triples: TripleRow[]) {
    const tx = this.tupleOperator;
    for (const triple of triples) {
      const { id: id, attribute, value, timestamp } = triple;
      tx.remove(['EAV', id, attribute, value, timestamp]);
      tx.remove(['AVE', attribute, value, id, timestamp]);
      tx.remove(['VAE', value, attribute, id, timestamp]);
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
    const tuples = await this.tupleOperator.scan({
      prefix: ['metadata', entityId, ...(attribute ?? [])],
    });

    return tuples.map(mapStaticTupleToEAV);
  }

  async updateMetadataTuples(updates: EAV[]) {
    for (const [entityId, attribute, value] of updates) {
      this.tupleOperator.set(['metadata', entityId, ...attribute], value);
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
        await this.tupleOperator.scan({
          prefix: ['metadata', entityId, ...(attribute ?? [])],
        })
      ).forEach((tuple) => this.tupleOperator.remove(tuple.key));
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
    const newTimestamp = await this.clock.getNextTimestamp();
    const existingTriples = await this.findByEntityAttribute(id, attribute);
    const olderTriples = existingTriples.filter(
      ({ timestamp, expired }) =>
        timestampCompare(timestamp, newTimestamp) == -1 && !expired
    );

    await this.deleteTriples(olderTriples);

    const newerTriples = existingTriples.filter(
      ({ timestamp }) => timestampCompare(timestamp, newTimestamp) == 1
    );
    if (newerTriples.length === 0) {
      await this.insertTriples([
        { id, attribute, value, timestamp: newTimestamp, expired: false },
      ]);
    }
  }
}

async function updateEntityIndex(
  tx: ScopedMultiTupleOperator<TupleIndex>,
  triple: TripleRow
) {
  const existingEntity = await getEntity(tx, triple.id);
  const updatedEntity = entityToResultReducer(existingEntity ?? {}, triple);
  tx.set(['Entity', triple.id], updatedEntity);
}

export class TripleStoreTransaction extends TripleStoreOperator {
  tupleTx: MultiTupleTransaction<TupleIndex>;

  constructor({
    tupleTx,
    clock,
    schema,
  }: {
    tupleTx: MultiTupleTransaction<TupleIndex>;
    clock: Clock;
    schema?: StoreSchema<Models<any, any>>;
  }) {
    super({ tupleOperator: tupleTx, clock, schema });
    this.tupleTx = tupleTx;
  }

  async commit(): Promise<void> {
    await this.tupleTx.commit();
  }

  async cancel(): Promise<void> {
    await this.tupleTx.cancel();
  }

  withScope(scope: StorageScope) {
    return new TripleStoreOperator({
      tupleOperator: this.tupleTx.withScope(scope),
      clock: this.clock,
      schema: this.schema,
    });
  }
}

export class TripleStore implements TripleStoreApi {
  stores: Record<
    string,
    AsyncTupleDatabaseClient<WithTenantIdPrefix<TupleIndex>>
  >;
  storageScope: string[];
  private schema?: StoreSchema<Models<any, any>>;
  tupleStore: MultiTupleStore<TupleIndex>;
  clock: Clock;
  tenantId: string;
  ensureInitializedSchema: Promise<void>;

  constructor({
    storage,
    stores,
    tenantId,
    schema,
    clock,
    storageScope = [],
  }: {
    storage?:
      | (TupleStorageApi | AsyncTupleStorageApi)
      | Record<string, TupleStorageApi | AsyncTupleStorageApi>;
    stores?: Record<
      string,
      AsyncTupleDatabaseClient<WithTenantIdPrefix<TupleIndex>>
    >;
    tenantId?: string;
    schema?: StoreSchema<Models<any, any>>;
    storageScope?: string[];
    clock?: Clock;
  }) {
    if (!stores && !storage)
      throw new Error('Must provide either storage or stores');
    if (stores && storage)
      throw new Error('Cannot provide both storage and stores');

    this.storageScope = storageScope;
    let normalizedStores;
    if (stores) {
      normalizedStores = stores;
    } else {
      const confirmedStorage = storage!;
      normalizedStores = isTupleStorage(confirmedStorage)
        ? {
            primary: new AsyncTupleDatabaseClient<
              WithTenantIdPrefix<TupleIndex>
            >(new AsyncTupleDatabase(confirmedStorage)),
          }
        : Object.fromEntries(
            Object.entries(confirmedStorage).map(([k, v]) => [
              k,
              new AsyncTupleDatabaseClient<WithTenantIdPrefix<TupleIndex>>(
                new AsyncTupleDatabase(v)
              ),
            ])
          );
    }
    // Server side database should provide a tenantId (project id)
    this.stores = normalizedStores;
    this.tenantId = tenantId ?? 'client';
    this.tupleStore = new MultiTupleStore<WithTenantIdPrefix<TupleIndex>>({
      storage: normalizedStores,
    }).subspace([this.tenantId]) as MultiTupleStore<TupleIndex>;

    this.clock = clock ?? new MemoryClock();
    this.clock.assignToStore(this);

    // If a schema is provided, overwrite the existing schema
    this.ensureInitializedSchema = schema
      ? this.overrideSchema(schema)
      : Promise.resolve();

    // Listen to future writes to the schema
    this.ensureInitializedSchema.then(() => {
      // Slightly different than on tx, here we update schema on commit
      // This is a bit awkward because we store schema on every store (which is also unnecessary)
      this.tupleStore.subscribe({ prefix: ['metadata'] }, async (writes) => {
        const { set = [], remove = [] } = writes;
        const dataWrites = set.filter(({ key }) => key[1] === '_schema');
        const dataDeletes = remove.filter((key) => key[1] === '_schema');
        if (dataWrites.length || dataDeletes.length) {
          this.schema = await this.readSchemaFromStorage();
        }
      });
    });
  }

  private async overrideSchema(schema: StoreSchema<Models<any, any>>) {
    await this.transact(async (tx) => {
      await tx.deleteMetadataTuples([['_schema']]);
      await tx.updateMetadataTuples(schemaToTriples(schema.collections));
    });
    this.schema = schema;
  }

  findByCollection(
    collection: string,
    direction?: 'ASC' | 'DESC' | undefined
  ): Promise<TripleRow[]> {
    return findByCollection(this.tupleStore, collection, direction);
  }

  async findValuesInRange(
    attribute: Attribute,
    constraints:
      | {
          greaterThan?: any;
          lessThan?: any;
          direction?: 'ASC' | 'DESC';
        }
      | undefined
  ) {
    return findValuesInRange(this.tupleStore, attribute, constraints);
  }

  findByEAV(
    [entityId, attribute, value]: [
      entityId?: string | undefined,
      attribute?: Attribute | undefined,
      value?: Value | undefined
    ],
    direction?: 'ASC' | 'DESC' | undefined
  ): Promise<TripleRow[]> {
    return findByEAV(this.tupleStore, [entityId, attribute, value], direction);
  }
  findByAVE(
    [attribute, value, entityId]: [
      attribute?: Attribute | undefined,
      value?: Value | undefined,
      entityId?: string | undefined
    ],
    direction?: 'ASC' | 'DESC' | undefined
  ): Promise<TripleRow[]> {
    return findByAVE(this.tupleStore, [attribute, value, entityId], direction);
  }
  // findByVAE(
  //   [value, attribute, entityId]: [
  //     value?: Value | undefined,
  //     attribute?: Attribute | undefined,
  //     entityId?: string | undefined
  //   ],
  //   direction?: 'ASC' | 'DESC' | undefined
  // ): Promise<TripleRow[]> {
  //   return findByVAE(this.tupleStore, [value, attribute, entityId], direction);
  // }
  findByEntity(id?: string | undefined): Promise<TripleRow[]> {
    return findByEntity(this.tupleStore, id);
  }
  findByEntityAttribute(
    id: string,
    attribute: Attribute
  ): Promise<TripleRow[]> {
    return findByEntityAttribute(this.tupleStore, id, attribute);
  }
  findByAttribute(attribute: Attribute): Promise<TripleRow[]> {
    return findByAttribute(this.tupleStore, attribute);
  }
  // findByValue(value: Value): Promise<TripleRow[]> {
  //   return findByValue(this.tupleStore, value);
  // }

  getEntity(entityId: string) {
    return getEntity(this.tupleStore, entityId);
  }

  getEntities(collectionName: string) {
    return getEntities(this.tupleStore, collectionName);
  }

  findMaxTimestamp(clientId: string) {
    return findMaxTimestamp(this.tupleStore, clientId);
  }

  findByClientTimestamp(
    clientId: string,
    scanDirection: 'lt' | 'lte' | 'gt' | 'gte',
    timestamp: Timestamp | undefined
  ) {
    return findByClientTimestamp(
      this.tupleStore,
      clientId,
      scanDirection,
      timestamp
    );
  }

  async transact(
    callback: (tx: TripleStoreTransaction) => Promise<void>,
    scope?: Parameters<typeof this.tupleStore.transact>[0]
  ) {
    // const schema = await this.readSchema();
    const schema = await this.readSchema();
    await this.tupleStore.autoTransact(async (tupleTx) => {
      const tx = new TripleStoreTransaction({
        tupleTx: tupleTx,
        clock: this.clock,
        schema,
      });
      try {
        await callback(tx);
      } catch (e) {
        throw e;
        // console.error(e);
      }
    }, scope);
    // const tx = new TripleStoreTransaction({
    //   tupleTx: this.tupleStore.transact(scope),
    //   clock: new ClientClock({
    //     clientId: this.tenantId,
    //     tick: this.clock.tick,
    //   }),
    //   schema: this.schema,
    // });
    // try {
    //   await callback(tx);
    //   await tx.commit();
    // } catch (e) {
    //   await tx.cancel();
    //   throw e;
    // }
  }

  setStorageScope(storageKeys: (keyof typeof this.stores)[]) {
    return new TripleStore({
      stores: Object.fromEntries(
        Object.entries(this.stores).filter(([storagekey]) =>
          storageKeys.includes(storagekey as keyof typeof this.stores)
        )
      ),
      storageScope: storageKeys,
      tenantId: this.tenantId,
      clock: this.clock,
    });
  }

  async setValue(
    entity: string,
    attribute: Attribute,
    value: Value
  ): Promise<void> {
    await this.transact(async (tx) => {
      await tx.setValue(entity, attribute, value);
    });
  }

  async insertTriple(tripleRow: TripleRow) {
    await this.transact(async (tx) => {
      await tx.insertTriple(tripleRow);
    });
  }

  async insertTriples(triplesInput: TripleRow[]) {
    await this.transact(async (tx) => {
      await tx.insertTriples(triplesInput);
    });
  }

  onInsert(callback: (triples: TripleRow[]) => void) {
    function writesCallback(writes: WriteOps<TupleIndex>) {
      const { set = [] } = writes;
      if (set.length === 0) return;
      const triples = set.map((w) => indexToTriple(w));
      callback(triples);
    }
    const unsub = this.tupleStore.subscribe(
      { prefix: ['EAV'] },
      writesCallback
    );
    return () => {
      unsub();
    };
  }

  // Including this as a way to capture any change to the store
  // We need this to have outbox scoped data updates since we directly delete data now
  // This might actually be a use case for tombstones
  onWrite(
    callback: (writes: { inserts: TripleRow[]; deletes: TripleRow[] }) => void
  ) {
    function writesCallback(writes: WriteOps<TupleIndex>) {
      const { set = [], remove = [] } = writes;
      if (set.length === 0 && remove.length === 0) return;
      const inserts = set.map((w) => indexToTriple(w));
      const deletes = remove.map((w) =>
        //@ts-ignore
        indexToTriple({ key: w, value: { expired: false } })
      );
      callback({ inserts, deletes });
    }
    const unsub = this.tupleStore.subscribe(
      { prefix: ['EAV'] },
      writesCallback
    );
    return unsub;
  }

  async deleteTriple(triple: TripleRow) {
    await this.transact(async (tx) => {
      await tx.deleteTriples([triple]);
    });
  }

  async deleteTriples(triples: TripleRow[]) {
    await this.transact(async (tx) => {
      await tx.deleteTriples(triples);
    });
  }

  async readMetadataTuples(entityId: string, attribute?: Attribute) {
    return (
      await this.tupleStore.scan({
        prefix: ['metadata', entityId, ...(attribute ?? [])],
      })
    ).map(mapStaticTupleToEAV);
  }

  async updateMetadataTuples(updates: EAV[]) {
    await this.transact(async (tx) => {
      await tx.updateMetadataTuples(updates);
    });
  }

  async deleteMetadataTuples(
    deletes: [entityId: string, attribute?: Attribute][]
  ) {
    await this.transact(async (tx) => {
      await tx.deleteMetadataTuples(deletes);
    });
  }

  async readSchema() {
    // Wait for initial schema write to complete
    await this.ensureInitializedSchema;
    // Lazily assign in memory schema object
    if (!this.schema) {
      this.schema = await this.readSchemaFromStorage();
    }
    return this.schema;
  }

  private async readSchemaFromStorage() {
    const schemaTriples = await this.readMetadataTuples('_schema');
    // At some point we probably want to validate the we extract (ie has expected props)
    if (!schemaTriples.length) return undefined;
    return triplesToSchema(schemaTriples);
  }

  async clear() {
    await this.tupleStore.clear();
  }
}

function validateTriple(
  schema: Models<any, any>,
  attribute: Attribute,
  value: Value
) {
  if (schema == undefined) {
    throw new Error('Cannot validate triples. No schema was registered.');
  }
  const [modelName, ...path] = attribute;

  // TODO: remove this hack
  if (modelName === '_collection') return;

  const model = schema[modelName];
  if (!model) {
    throw new Error(
      `${modelName} does not match any registered models (${Object.keys(
        schema
      ).join(', ')})`
    );
  }

  // Leaf values are an array [value, timestamp], so check value
  const clockedSchema = getSchemaFromPath(model, path);
  const valueSchema = clockedSchema.items[0];
  if (!SchemaValue.Check(valueSchema, value))
    throw new Error(
      `Value ${value} does not match schema for ${attribute.join('.')}`
    );
}

async function scanToTriples(
  tx: MultiTupleStoreOrTransaction,
  ...scanParams: Parameters<MultiTupleStoreOrTransaction['scan']>
) {
  // console.log(scanParams);
  // @ts-ignore
  return (await tx.scan(...scanParams)).map(indexToTriple);
}

async function findByCollection(
  tx: MultiTupleStoreOrTransaction,
  collectionName: string,
  direction?: 'ASC' | 'DESC'
) {
  return scanToTriples(tx, {
    prefix: ['EAV'],
    gte: [collectionName],
    // @ts-ignore
    lt: [collectionName + MAX],
    reverse: direction === 'DESC',
  });
}

async function findByEAV(
  tx: MultiTupleStoreOrTransaction,
  [entityId, attribute, value]: [
    entityId?: EntityId,
    attribute?: Attribute,
    value?: Value
  ] = [],
  direction?: 'ASC' | 'DESC'
) {
  const scanArgs = {
    prefix: ['EAV'],
    gte: [entityId ?? MIN, attribute ?? MIN, value ?? MIN],
    // @ts-ignore
    lt: [entityId ?? MAX, [...(attribute ?? []), MAX], MAX],
    reverse: direction === 'DESC',
  };
  return scanToTriples(tx, scanArgs);
}

function findByAVE(
  tx: MultiTupleStoreOrTransaction,
  [attribute, value, entityId]: [
    attribute?: Attribute,
    value?: Value,
    entityId?: EntityId
  ] = [],
  direction?: 'ASC' | 'DESC'
) {
  return scanToTriples(tx, {
    prefix: ['AVE'],
    gte: [attribute ?? MIN, value ?? MIN, entityId ?? MIN],
    // @ts-ignore
    lt: [[...(attribute ?? []), ...(value ? [] : [MAX])], value ?? MAX, MAX],
    reverse: direction === 'DESC',
  });
}

function findValuesInRange(
  tx: MultiTupleStoreOrTransaction,
  attribute: Attribute,
  {
    greaterThan,
    lessThan,
    direction,
  }: {
    greaterThan?: ValueCursor;
    lessThan?: ValueCursor;
    direction?: 'ASC' | 'DESC';
  } = {}
) {
  const scanArgs = {
    prefix: ['AVE'],
    // @ts-ignore
    gt: [attribute].concat(greaterThan ?? [MIN, MIN]),
    // @ts-ignore
    lt: [attribute].concat(lessThan ?? [MAX, MAX]),
    reverse: direction === 'DESC',
  };
  return scanToTriples(tx, scanArgs);
}

// function findByVAE(
//   tx: MultiTupleStoreOrTransaction,
//   [value, attribute, entityId]: [
//     value?: Value,
//     attribute?: Attribute,
//     entityId?: EntityId
//   ] = [],
//   direction?: 'ASC' | 'DESC'
// ) {
//   return scanToTriples(tx, {
//     prefix: ['VAE'],
//     gte: [value ?? MIN, attribute ?? MIN, entityId ?? MIN],
//     // @ts-ignore
//     lt: [value ?? MAX, [...(attribute ?? []), MAX], MAX],
//     reverse: direction === 'DESC',
//   });
// }

async function findByEntity(
  tx: MultiTupleStoreOrTransaction,
  id?: EntityId
): Promise<TripleRow[]> {
  return findByEAV(tx, [id]);
}

async function findByEntityAttribute(
  tx: MultiTupleStoreOrTransaction,
  id: EntityId,
  attribute: Attribute
): Promise<TripleRow[]> {
  return findByEAV(tx, [id, attribute]);
}

async function findByAttribute(
  tx: MultiTupleStoreOrTransaction,
  attribute: Attribute
): Promise<TripleRow[]> {
  return findByAVE(tx, [attribute]);
}

// async function findByValue(
//   tx: MultiTupleStoreOrTransaction,
//   value: Value
// ): Promise<TripleRow[]> {
//   return findByVAE(tx, [value]);
// }

// [tenantId, 'metadata', '_schema'] prefix
function mapStaticTupleToEAV(tuple: { key: any[]; value: any }): EAV {
  const [_index, entityId, ...path] = tuple.key;
  return [entityId, path, tuple.value];
}

// NOTE: SOME WEIRD STUFF GOING ON WITH TUPLE DATABASE AND gt/lte with array prefixes
async function findByClientTimestamp(
  tx: MultiTupleStoreOrTransaction,
  clientId: string,
  scanDirection: 'lt' | 'lte' | 'gt' | 'gte',
  timestamp: Timestamp | undefined
) {
  const indexPrefix = ['clientTimestamp', clientId];
  if (scanDirection === 'lt') {
    if (!timestamp) return [];
    return await scanToTriples(tx, {
      prefix: indexPrefix,
      lt: [timestamp],
    });
  }
  if (scanDirection === 'lte') {
    if (!timestamp) return [];
    return await scanToTriples(tx, {
      prefix: indexPrefix,
      lte: [[...timestamp, MAX]],
    });
  }
  if (scanDirection === 'gt') {
    return scanToTriples(tx, {
      prefix: indexPrefix,
      gt: [[...(timestamp ?? []), MIN]],
    });
  }
  if (scanDirection === 'gte') {
    return scanToTriples(tx, {
      prefix: indexPrefix,
      gte: [[...(timestamp ?? [])]],
    });
  }
  throw new Error('Cannot scan with direction ' + scanDirection);
}

async function getEntity(tx: MultiTupleStoreOrTransaction, entityId: string) {
  const res = await tx.scan({
    prefix: ['Entity'],
    limit: 1,
    gte: [entityId],
  });
  if (res.length === 0 || res[0].key[1] !== entityId) return null;
  return res[0].value;
}

async function getEntities(
  tx: MultiTupleStoreOrTransaction,
  collectionName: string
) {
  const res = await tx.scan({
    prefix: ['Entity'],
    gte: [collectionName],
    lt: [collectionName + MAX],
  });
  return new Map(res.map((r) => [r.key[1], r.value]));
}

async function findMaxTimestamp(
  tx: MultiTupleStoreOrTransaction,
  clientId: string
) {
  const res = (await tx.scan({
    prefix: ['clientTimestamp', clientId],
    reverse: true,
  })) as ClientTimestampIndex[];
  return res[0]?.key[2];
}

import * as ComLink from 'comlink';
import type {
  TriplitClient as Client,
  ClientOptions,
  SubscriptionOptions,
} from './triplit-client.js';
import {
  ChangeTracker,
  CollectionNameFromModels,
  DBTransaction,
  JSONToSchema,
  UpdateTypeFromModel,
  createUpdateProxy,
  schemaToJSON,
} from '@triplit/db';
import {
  ClientFetchResult,
  ClientQuery,
  ClientQueryBuilder,
  ClientSchema,
} from './utils/query.js';
import { ConnectionStatus } from './index.js';

export class BrowserClient<M extends ClientSchema | undefined> {
  clientWorker: Client;
  initialized: Promise<void>;
  syncEngine = {
    connectionStatus: 'open',
    onConnectionStatusChange: () => () => {},
  };
  constructor(options?: ClientOptions<M>) {
    // const worker = new SharedWorker('./client-worker.js');
    const worker = new SharedWorker(
      new URL('./client-worker.ts', import.meta.url),
      { type: 'module' }
    );
    // @ts-ignore
    this.clientWorker = ComLink.wrap(worker.port);
    const { schema } = options || {};
    // @ts-ignore
    this.initialized = this.clientWorker.init({
      ...options,
      schema: schema && schemaToJSON({ collections: schema, version: 0 }),
    });
  }

  query<CN extends CollectionNameFromModels<M>>(
    collectionName: CN
  ): ClientQueryBuilder<M, CN> {
    return ClientQueryBuilder<M, CN>(collectionName);
  }
  // @ts-ignore
  async fetch(...args) {
    await this.initialized;
    // @ts-ignore
    return this.clientWorker.fetch(...args);
  }
  //   async transact(...args) {
  async transact<Output>(callback: (tx: DBTransaction<M>) => Promise<Output>) {
    await this.initialized;
    // @ts-ignore
    return this.clientWorker.transact(ComLink.proxy(callback));
  }
  // @ts-ignore
  async fetchById(...args) {
    await this.initialized;
    // @ts-ignore
    return this.clientWorker.fetchById(...args);
  }
  // @ts-ignore
  async fetchOne(...args) {
    await this.initialized;
    // @ts-ignore
    return this.clientWorker.fetchOne(...args);
  }
  // @ts-ignore
  async insert(...args) {
    await this.initialized;
    // @ts-ignore
    return this.clientWorker.insert(...args);
  }
  // @ts-ignore
  async update<CN extends CollectionNameFromModels<any>>(
    collectionName: CN,
    entityId: string,
    updater: (entity: UpdateTypeFromModel<any>) => void | Promise<void>
  ): Promise<{ txId: string | undefined; output: void | undefined }> {
    await this.initialized;
    // const schema = (await this.clientOperator.getSchema())?.collections as M;
    const schemaJSON = await this.clientWorker.getSchema();
    const schema = schemaJSON && JSONToSchema(schemaJSON)?.collections;
    // @ts-ignore
    return this.updateRaw(collectionName, entityId, async (entity) => {
      const changes = new ChangeTracker(entity);
      const updateProxy =
        collectionName === '_metadata'
          ? createUpdateProxy<M, any>(changes, entity)
          : createUpdateProxy<M, any>(changes, entity, schema, collectionName);
      await updater(updateProxy);
      // return dbDocumentToTuples(updateProxy);
      return changes.getTuples();
    });
  }

  async updateRaw<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entityId: string,
    updater: (entity: any) => any
  ) {
    await this.initialized;
    // @ts-ignore
    return this.clientWorker.updateRaw(
      collectionName,
      entityId,
      ComLink.proxy(updater)
    );
  }

  // @ts-ignore
  async delete(...args) {
    await this.initialized;
    // @ts-ignore
    return this.clientWorker.delete(...args);
  }
  subscribe<CQ extends ClientQuery<M, any>>(
    query: CQ,
    onResults: (
      results: ClientFetchResult<CQ>,
      info: { hasRemoteFulfilled: boolean }
    ) => void | Promise<void>,
    onError?: (error: any) => void | Promise<void>,
    options?: Partial<SubscriptionOptions>
  ) {
    const unsubPromise = (async () => {
      await this.initialized;
      // @ts-ignore
      return this.clientWorker.subscribe(
        // @ts-ignore
        query,
        ComLink.proxy(onResults),
        onError && ComLink.proxy(onError),
        options && ComLink.proxy(options)
      );
    })();
    return () => {
      unsubPromise.then((unsub) => unsub());
    };
  }
  // @ts-ignore
  async subscribeWithPagination(...args) {
    await this.initialized;
    // @ts-ignore
    return this.clientWorker.subscribeWithPagination(...args);
  }
  // @ts-ignore
  async subscribeWithExpand(...args) {
    await this.initialized;
    // @ts-ignore
    return this.clientWorker.subscribeWithExpand(...args);
  }
  // @ts-ignore
  async updateOptions(...args) {
    await this.initialized;
    // @ts-ignore
    return this.clientWorker.updateOptions(...args);
  }
  // @ts-ignore
  // @ts-ignore
  async updateToken(...args) {
    await this.initialized;
    // @ts-ignore
    return this.clientWorker.updateToken(...args);
  }
  // @ts-ignore
  async updateServerUrl(...args) {
    await this.initialized;
    // @ts-ignore
    return this.clientWorker.updateServerUrl(...args);
  }

  onTxCommitRemote(txId: string, callback: () => void) {
    return this.clientWorker.onTxCommitRemote(txId, ComLink.proxy(callback));
  }

  onTxFailureRemote(txId: string, callback: () => void) {
    return this.clientWorker.onTxFailureRemote(txId, ComLink.proxy(callback));
  }

  onConnectionStatusChange(
    callback: (status: ConnectionStatus) => void,
    runImmediately?: boolean
  ) {
    return this.clientWorker.onConnectionStatusChange(
      ComLink.proxy(callback),
      runImmediately
    );
  }
}

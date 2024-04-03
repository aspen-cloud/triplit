import * as ComLink from 'comlink';
import type {
  TriplitClient as Client,
  ClientOptions,
  FetchOptions,
  InfiniteSubscription,
  PaginatedSubscription,
  SubscriptionOptions,
} from './triplit-client.js';
import {
  ChangeTracker,
  CollectionNameFromModels,
  DBTransaction,
  FetchByIdQueryParams,
  InsertTypeFromModel,
  JSONToSchema,
  ModelFromModels,
  UpdateTypeFromModel,
  createUpdateProxy,
  schemaToJSON,
} from '@triplit/db';
import {
  ClientFetchResult,
  ClientFetchResultEntity,
  ClientQuery,
  ClientQueryBuilder,
  ClientSchema,
} from './utils/query.js';
import { ConnectionStatus } from './index.js';

export class WorkerClient<M extends ClientSchema | undefined = undefined> {
  initialized: Promise<void>;
  syncEngine = {
    connectionStatus: 'open',
    onConnectionStatusChange: () => () => {},
  };
  clientWorker: ComLink.Remote<Client<M>>;
  constructor(options?: ClientOptions<M>) {
    const worker = new SharedWorker(
      new URL('./worker-client-operator.ts', import.meta.url),
      { type: 'module' }
    );
    this.clientWorker = ComLink.wrap<Client<M>>(worker.port);
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

  async fetch<CQ extends ClientQuery<M, any>>(
    query: CQ,
    options?: Partial<FetchOptions>
  ): Promise<ClientFetchResult<CQ>> {
    await this.initialized;
    // @ts-expect-error
    return this.clientWorker.fetch(query, options);
  }
  async transact<Output>(callback: (tx: DBTransaction<M>) => Promise<Output>) {
    await this.initialized;
    return this.clientWorker.transact(ComLink.proxy(callback));
  }
  async fetchById<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    id: string,
    queryParams?: FetchByIdQueryParams<M, CN>,
    options?: Partial<FetchOptions>
  ) {
    await this.initialized;
    return this.clientWorker.fetchById(
      // @ts-ignore
      collectionName,
      id,
      queryParams,
      options
    );
  }
  async fetchOne<CQ extends ClientQuery<M, any>>(
    query: CQ,
    options?: Partial<FetchOptions>
  ): Promise<ClientFetchResultEntity<CQ> | null> {
    await this.initialized;
    return this.clientWorker.fetchOne(query, options);
  }
  async insert<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entity: InsertTypeFromModel<ModelFromModels<M, CN>>
  ) {
    await this.initialized;
    return this.clientWorker.insert(
      // @ts-ignore
      collectionName,
      entity
    );
  }
  async update<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entityId: string,
    updater: (
      entity: UpdateTypeFromModel<ModelFromModels<M, CN>>
    ) => void | Promise<void>
  ) {
    await this.initialized;

    const schemaJSON = await this.clientWorker.getSchema();
    const schema = schemaJSON && JSONToSchema(schemaJSON)?.collections;

    return this.updateRaw(collectionName, entityId, async (entity) => {
      const changes = new ChangeTracker(entity);
      const updateProxy =
        collectionName === '_metadata'
          ? createUpdateProxy<M, any>(changes, entity)
          : createUpdateProxy<M, any>(changes, entity, schema, collectionName);
      await updater(updateProxy);
      return changes.getTuples();
    });
  }

  async updateRaw<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entityId: string,
    updater: (entity: any) => any
  ) {
    await this.initialized;
    return this.clientWorker.updateRaw(
      // @ts-ignore
      collectionName,
      entityId,
      ComLink.proxy(updater)
    );
  }

  async delete<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entityId: string
  ) {
    await this.initialized;
    return this.clientWorker.delete(
      // @ts-ignore
      collectionName,
      entityId
    );
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
      return this.clientWorker.subscribe(
        query,
        // @ts-ignore
        ComLink.proxy(onResults),
        onError && ComLink.proxy(onError),
        options && ComLink.proxy(options)
      );
    })();
    return () => {
      unsubPromise.then((unsub) => unsub());
    };
  }
  /**
   * Subscribe to a query with helpers for pagination
   * This query will "oversubscribe" by 1 on either side of the current page to determine if there are "next" or "previous" pages
   * The window generally looks like [buffer, ...page..., buffer]
   * Depending on the current paging direction, the query may have its original order reversed
   *
   * The pagination will also do its best to always return full pages
   */
  async subscribeWithPagination<CQ extends ClientQuery<M, any>>(
    query: CQ,
    onResults: (
      results: ClientFetchResult<CQ>,
      info: {
        hasRemoteFulfilled: boolean;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
      }
    ) => void | Promise<void>,
    onError?: (error: any) => void | Promise<void>,
    options?: Partial<SubscriptionOptions>
  ): Promise<PaginatedSubscription> {
    await this.initialized;
    return this.clientWorker.subscribeWithPagination(
      query,
      // @ts-ignore
      ComLink.proxy(onResults),
      onError,
      options
    );
  }

  async subscribeWithExpand<CQ extends ClientQuery<M, any>>(
    query: CQ,
    onResults: (
      results: ClientFetchResult<CQ>,
      info: {
        hasRemoteFulfilled: boolean;
        hasMore: boolean;
      }
    ) => void | Promise<void>,
    onError?: (error: any) => void | Promise<void>,
    options?: Partial<SubscriptionOptions>
  ): Promise<InfiniteSubscription> {
    await this.initialized;
    return this.clientWorker.subscribeWithExpand(
      query,
      // @ts-ignore
      ComLink.proxy(onResults),
      onError,
      options
    );
  }

  async updateOptions(
    options: Pick<ClientOptions<undefined>, 'token' | 'serverUrl'>
  ) {
    await this.initialized;
    return this.clientWorker.updateOptions(options);
  }
  async updateToken(token?: string) {
    await this.initialized;
    return this.clientWorker.updateToken(token);
  }

  async updateServerUrl(serverUrl: string) {
    await this.initialized;
    return this.clientWorker.updateServerUrl(serverUrl);
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
    const unSubPromise = this.clientWorker.onConnectionStatusChange(
      ComLink.proxy(callback),
      runImmediately
    );
    return async () => {
      (await unSubPromise)();
    };
  }
}

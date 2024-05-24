import * as ComLink from 'comlink';
import type {
  TriplitClient as Client,
  ClientOptions,
  FetchOptions,
  InfiniteSubscription,
  PaginatedSubscription,
  SubscriptionOptions,
  TriplitClient,
} from './triplit-client.js';
import {
  ChangeTracker,
  CollectionNameFromModels,
  CollectionQuery,
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
  clientQueryBuilder,
} from './utils/query.js';
import { ConnectionStatus } from './index.js';

export class WorkerClient<M extends ClientSchema | undefined = undefined>
  implements TriplitClient<M>
{
  initialized: Promise<void>;
  clientWorker: ComLink.Remote<Client<M>>;
  constructor(options?: ClientOptions<M> & { workerUrl?: string }) {
    const worker = new SharedWorker(
      options?.workerUrl ??
        new URL('worker-client-operator.js', import.meta.url),
      { type: 'module', name: 'triplit-client' }
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
  ): ReturnType<typeof clientQueryBuilder<M, CN>> {
    return clientQueryBuilder<M, CN>(collectionName);
  }

  async fetch<CQ extends ClientQuery<M, any>>(
    query: CQ,
    options?: Partial<FetchOptions>
  ): Promise<ClientFetchResult<CQ>> {
    await this.initialized;
    // @ts-expect-error
    return this.clientWorker.fetch(query, options);
  }
  // @ts-ignore
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
  subscribe<CQ extends ClientQuery<M, any, any, any>>(
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
        // CURRENTLY ONLY SUPPORTS onRemoteFulfilled
        // Comlink is having trouble either just proxying the callback
        // inside options or proxying the whole options object
        // @ts-ignore
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
  subscribeWithPagination<CQ extends ClientQuery<M, any>>(
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
  ): PaginatedSubscription {
    const subscriptionPromise = this.initialized.then(() =>
      this.clientWorker.subscribeWithPagination(
        query,
        // @ts-ignore
        ComLink.proxy(onResults),
        // @ts-ignore
        onError && ComLink.proxy(onError),
        // @ts-ignore
        options && ComLink.proxy(options)
      )
    );
    const unsubscribe = () => {
      subscriptionPromise.then((sub) => sub.unsubscribe());
    };
    const nextPage = () => {
      subscriptionPromise.then((sub) => sub.nextPage());
    };
    const prevPage = () => {
      subscriptionPromise.then((sub) => sub.prevPage());
    };

    return { unsubscribe, nextPage, prevPage };
  }

  subscribeWithExpand<CQ extends ClientQuery<M, any>>(
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
  ): InfiniteSubscription {
    const subscriptionPromise = this.initialized.then(() =>
      this.clientWorker.subscribeWithExpand(
        query,
        // @ts-ignore
        ComLink.proxy(onResults),
        // @ts-ignore
        onError && ComLink.proxy(onError),
        // @ts-ignore
        options && ComLink.proxy(options)
      )
    );
    const unsubscribe = () => {
      subscriptionPromise.then((sub) => sub.unsubscribe());
    };
    const loadMore = (pageSize?: number) => {
      subscriptionPromise.then((sub) => sub.loadMore(pageSize));
    };
    return { loadMore, unsubscribe };
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

  // async get connectionStatus(){
  //   return this.clientWorker.connectionStatus;
  // }

  isFirstTimeFetchingQuery(query: CollectionQuery<any, any>): Promise<boolean> {
    return this.clientWorker.isFirstTimeFetchingQuery(query);
  }

  onTxCommitRemote(txId: string, callback: () => void) {
    const asyncUnsub = this.clientWorker.onTxCommitRemote(
      txId,
      ComLink.proxy(callback)
    );
    return () => asyncUnsub.then((unsub) => unsub());
  }

  onTxFailureRemote(txId: string, callback: () => void) {
    const asyncUnsub = this.clientWorker.onTxFailureRemote(
      txId,
      ComLink.proxy(callback)
    );
    return () => asyncUnsub.then((unsub) => unsub());
  }

  onConnectionStatusChange(
    callback: (status: ConnectionStatus) => void,
    runImmediately?: boolean
  ) {
    const unSubPromise = this.clientWorker.onConnectionStatusChange(
      ComLink.proxy(callback),
      runImmediately
    );
    return () => unSubPromise.then((unsub) => unsub());
  }
}

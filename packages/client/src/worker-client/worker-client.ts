import * as ComLink from 'comlink';
import type {
  TriplitClient as Client,
  ClientOptions,
  FetchOptions,
  InfiniteSubscription,
  PaginatedSubscription,
  SubscriptionOptions,
} from '../client/triplit-client.js';
import {
  ChangeTracker,
  ClearOptions,
  CollectionNameFromModels,
  CollectionQuery,
  CollectionQueryDefault,
  DBTransaction,
  FetchResult,
  FetchResultEntity,
  FetchResultEntityFromParts,
  InsertTypeFromModel,
  JSONToSchema,
  ModelFromModels,
  SchemaQueries,
  ToQuery,
  TransactionResult,
  Unalias,
  UpdateTypeFromModel,
  createUpdateProxy,
  schemaToJSON,
} from '@triplit/db';
import { ConnectionStatus } from '../transport/transport.js';
import {
  ClientQueryDefault,
  ClientSchema,
  SchemaClientQueries,
} from '../client/types';
import { clientQueryBuilder } from '../client/query-builder.js';
import SuperJSON from 'superjson';

export function getTriplitWorkerEndpoint(workerUrl?: string): ComLink.Endpoint {
  const url =
    workerUrl ?? new URL('worker-client-operator.js', import.meta.url);
  const options: WorkerOptions = { type: 'module', name: 'triplit-client' };
  const isSharedWorker = typeof SharedWorker !== 'undefined';
  return isSharedWorker
    ? new SharedWorker(url, options).port
    : new Worker(url, options);
  //
}

export function getTriplitSharedWorkerPort(
  workerUrl?: string
): SharedWorker['port'] {
  const url =
    workerUrl ?? new URL('worker-client-operator.js', import.meta.url);
  const options: WorkerOptions = { type: 'module', name: 'triplit-client' };
  return new SharedWorker(url, options).port;
}

function logObjToMessage(lobObj: any) {
  const message = lobObj.scope
    ? [`%c${lobObj.scope}`, 'color: #888', lobObj.message]
    : [lobObj.message];
  return [...message, ...lobObj.args.map(SuperJSON.deserialize)];
}

class WorkerLogger {
  error(log: any) {
    console.error(...logObjToMessage(log));
  }
  warn(log: any) {
    console.warn(...logObjToMessage(log));
  }
  info(log: any) {
    console.info(...logObjToMessage(log));
  }
  debug(log: any) {
    console.debug(...logObjToMessage(log));
  }
}

export class WorkerClient<M extends ClientSchema = ClientSchema> {
  initialized: Promise<void>;
  clientWorker: ComLink.Remote<Client<M>>;
  db: { updateGlobalVariables: (variables: Record<string, any>) => void } =
    {} as any;
  private _connectionStatus: ConnectionStatus;
  constructor(
    options?: ClientOptions<M> & {
      workerUrl?: string;
    },
    workerEndpoint?: ComLink.Endpoint,
    sharedWorkerPort?: MessagePort
  ) {
    workerEndpoint =
      workerEndpoint ??
      sharedWorkerPort ??
      getTriplitWorkerEndpoint(options?.workerUrl);
    this.clientWorker = ComLink.wrap<Client<M>>(workerEndpoint);
    const { schema } = options || {};
    // @ts-expect-error
    this.initialized = this.clientWorker.init(
      {
        ...options,
        schema: schema && schemaToJSON({ collections: schema, version: 0 }),
      },
      ComLink.proxy(new WorkerLogger())
    );
    this._connectionStatus =
      options?.autoConnect === false ? 'CLOSED' : 'CONNECTING';
    this.onConnectionStatusChange((status) => {
      this._connectionStatus = status;
    }, true);
    this.db.updateGlobalVariables = (variables) => {
      //@ts-expect-error
      this.clientWorker.updateGlobalVariables(variables);
    };
  }

  get connectionStatus() {
    return this._connectionStatus;
  }

  query<CN extends CollectionNameFromModels<M>>(
    collectionName: CN
  ): ReturnType<typeof clientQueryBuilder<M, CN>> {
    return clientQueryBuilder<M, CN>(collectionName);
  }

  async fetch<CQ extends SchemaClientQueries<M>>(
    query: CQ,
    options?: Partial<FetchOptions>
  ): Promise<Unalias<FetchResult<M, ToQuery<M, CQ>>>> {
    await this.initialized;
    // @ts-expect-error
    return this.clientWorker.fetch(query, options);
  }

  async transact<Output>(
    callback: (tx: DBTransaction<M>) => Promise<Output>
  ): Promise<TransactionResult<Output>> {
    await this.initialized;
    const wrappedTxCallback = async (tx: DBTransaction<M>) => {
      // create a proxy wrapper around TX that intercepts calls to tx.update that
      // normally takes a callback so instead we wrap with ComLink.proxy
      const proxiedTx = new Proxy(tx, {
        get(target, prop) {
          if (prop === 'update') {
            return async (
              collectionName: any,
              entityId: string,
              updater: any
            ) => {
              const schemaJSON = await tx.getSchemaJson();
              const schema =
                schemaJSON && JSONToSchema(schemaJSON)?.collections;

              await tx.updateRaw(
                collectionName,
                entityId,
                ComLink.proxy(async (entity) => {
                  const changes = new ChangeTracker(entity);
                  const updateProxy =
                    collectionName === '_metadata'
                      ? createUpdateProxy(changes, entity)
                      : createUpdateProxy(
                          changes,
                          entity,
                          schema,
                          collectionName
                        );
                  await updater(
                    updateProxy as Unalias<
                      // @ts-expect-error
                      UpdateTypeFromModel<ModelFromModels<M, CN>>
                    >
                  );
                  const changedTuples = changes.getTuples();
                  return changedTuples;
                })
              );
            };
          }
          // @ts-expect-error
          return target[prop];
        },
      });
      return await callback(proxiedTx);
    };
    return this.clientWorker.transact(
      ComLink.proxy(wrappedTxCallback)
    ) as Promise<TransactionResult<Output>>;
  }
  async fetchById<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    id: string,
    options?: Partial<FetchOptions>
  ): Promise<Unalias<
    FetchResultEntity<M, ToQuery<M, ClientQueryDefault<M, CN>>>
  > | null> {
    await this.initialized;
    return this.clientWorker.fetchById(
      // @ts-expect-error
      collectionName,
      id,
      options
    ) as Unalias<
      FetchResultEntity<M, ToQuery<M, ClientQueryDefault<M, CN>>>
    > | null;
  }
  async fetchOne<CQ extends SchemaClientQueries<M>>(
    query: CQ,
    options?: Partial<FetchOptions>
  ): Promise<Unalias<FetchResultEntity<M, ToQuery<M, CQ>>> | null> {
    await this.initialized;
    return this.clientWorker.fetchOne(
      // @ts-expect-error
      query,
      options
    ) as Unalias<FetchResultEntity<M, ToQuery<M, CQ>>> | null;
  }
  async insert<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entity: Unalias<InsertTypeFromModel<ModelFromModels<M, CN>>>
  ): Promise<TransactionResult<Unalias<FetchResultEntityFromParts<M, CN>>>> {
    await this.initialized;
    return this.clientWorker.insert(
      // @ts-expect-error
      collectionName,
      entity
    );
  }
  async update<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entityId: string,
    updater: (
      entity: Unalias<UpdateTypeFromModel<ModelFromModels<M, CN>>>
    ) => void | Promise<void>
  ) {
    await this.initialized;

    const schemaJSON = await this.clientWorker.getSchemaJson();
    const schema = schemaJSON && JSONToSchema(schemaJSON)?.collections;

    return this.updateRaw(collectionName, entityId, async (entity) => {
      const changes = new ChangeTracker(entity);
      const updateProxy =
        collectionName === '_metadata'
          ? createUpdateProxy(changes, entity)
          : createUpdateProxy(changes, entity, schema, collectionName);
      await updater(
        updateProxy as Unalias<UpdateTypeFromModel<ModelFromModels<M, CN>>>
      );
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
      // @ts-expect-error
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
      // @ts-expect-error
      collectionName,
      entityId
    );
  }
  subscribe<CQ extends SchemaClientQueries<M>>(
    query: CQ,
    onResults: (
      results: Unalias<FetchResult<M, ToQuery<M, CQ>>>,
      info: { hasRemoteFulfilled: boolean }
    ) => void | Promise<void>,
    onError?: (error: any) => void | Promise<void>,
    options?: Partial<SubscriptionOptions>
  ) {
    const unsubPromise = (async () => {
      await this.initialized;
      return this.clientWorker.subscribe(
        // @ts-expect-error
        query,
        ComLink.proxy(onResults),
        onError && ComLink.proxy(onError),
        // CURRENTLY ONLY SUPPORTS onRemoteFulfilled
        // Comlink is having trouble either just proxying the callback
        // inside options or proxying the whole options object
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
  subscribeWithPagination<CQ extends SchemaClientQueries<M>>(
    query: CQ,
    onResults: (
      results: Unalias<FetchResult<M, ToQuery<M, CQ>>>,
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
        // @ts-expect-error
        query,
        ComLink.proxy(onResults),
        onError && ComLink.proxy(onError),
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

  subscribeWithExpand<CQ extends SchemaClientQueries<M>>(
    query: CQ,
    onResults: (
      results: Unalias<FetchResult<M, ToQuery<M, CQ>>>,
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
        // @ts-expect-error
        query,
        ComLink.proxy(onResults),
        onError && ComLink.proxy(onError),
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

  async getSchemaJson() {
    await this.initialized;
    return await this.clientWorker.getSchemaJson();
  }

  async getSchema() {
    await this.initialized;
    return JSONToSchema(await this.clientWorker.getSchemaJson());
  }

  async updateOptions(options: Pick<ClientOptions, 'token' | 'serverUrl'>) {
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

  async isFirstTimeFetchingQuery(
    query: CollectionQuery<any, any>
  ): Promise<boolean> {
    await this.initialized;
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
    const asyncUnsub = this.initialized.then(() =>
      this.clientWorker.onTxFailureRemote(txId, ComLink.proxy(callback))
    );
    return () => asyncUnsub.then((unsub) => unsub());
  }

  onConnectionStatusChange(
    callback: (status: ConnectionStatus) => void,
    runImmediately?: boolean
  ) {
    const unSubPromise = this.initialized.then(() =>
      this.clientWorker.onConnectionStatusChange(
        ComLink.proxy(callback),
        runImmediately
      )
    );
    return () => unSubPromise.then((unsub) => unsub());
  }

  async connect() {
    await this.initialized;
    return this.clientWorker.connect();
  }
  async disconnect() {
    await this.initialized;
    return this.clientWorker.disconnect();
  }
  async retry(txId: string) {
    await this.initialized;
    return this.clientWorker.retry(txId);
  }
  async rollback(txIds: string | string[]) {
    await this.initialized;
    return this.clientWorker.rollback(txIds);
  }

  async clear(options: ClearOptions = {}) {
    await this.initialized;
    return this.clientWorker.clear(options);
  }

  async reset(options: ClearOptions = {}) {
    await this.initialized;
    return this.clientWorker.reset(options);
  }
}

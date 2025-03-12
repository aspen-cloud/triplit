import * as ComLink from 'comlink';
import type {
  TriplitClient as Client,
  ClientOptions,
  SimpleClientStorageOptions,
} from '../client/triplit-client.js';
import { ConnectionStatus } from '../transport/transport.js';
import {
  SubscribeBackgroundOptions,
  ClientFetchOptions,
  InfiniteSubscription,
  PaginatedSubscription,
  SubscriptionOptions,
  SubscriptionSignalPayload,
} from '../client/types';
import SuperJSON from 'superjson';
import {
  ClearOptions,
  CollectionNameFromModels,
  CollectionQuery,
  createUpdateProxyAndTrackChanges,
  EntityNotFoundError,
  FetchResult,
  InvalidCollectionNameError,
  Models,
  queryBuilder,
  SchemaQuery,
  SubscriptionResultsCallback,
  TransactCallback,
  Type,
  Unalias,
  UpdatePayload,
  WriteModel,
} from '@triplit/db';
import { ClientComlinkWrapper } from './client-comlink-wrapper.js';
import { ClientTransactOptions } from '../client/types/client.js';

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

export class WorkerClient<M extends Models<M> = Models> implements Client<M> {
  initialized: Promise<void>;
  clientWorker: ClientComlinkWrapper<M>; //ComLink.Remote<Client<M>>;
  // @ts-expect-error TODO: use interface for ClientAPI
  db: { updateGlobalVariables: (variables: Record<string, any>) => void } =
    {} as any;
  private _connectionStatus: ConnectionStatus;
  constructor(
    options?: Omit<ClientOptions<M>, 'storage'> & {
      workerUrl?: string;
      storage?: SimpleClientStorageOptions;
    },
    workerEndpoint?: ComLink.Endpoint,
    sharedWorkerPort?: MessagePort
  ) {
    workerEndpoint =
      workerEndpoint ??
      sharedWorkerPort ??
      getTriplitWorkerEndpoint(options?.workerUrl);
    // @ts-expect-error
    this.clientWorker = ComLink.wrap(workerEndpoint) as ClientComlinkWrapper<M>;
    const {
      schema,
      onSessionError,
      token,
      refreshOptions,
      autoConnect,
      ...remainingOptions
    } = options || {};
    if (token) {
      this.startSession(
        token,
        autoConnect,
        refreshOptions && ComLink.proxy(refreshOptions)
      );
    }
    if (onSessionError) {
      this.onSessionError(onSessionError);
    }
    // @ts-expect-error
    this.initialized = this.clientWorker.init(
      {
        ...remainingOptions,
        schema: schema,
      },
      ComLink.proxy(new WorkerLogger())
    );
    this._connectionStatus =
      options?.autoConnect === false ? 'CLOSED' : 'CONNECTING';
    this.onConnectionStatusChange((status) => {
      this._connectionStatus = status;
    }, true);
    this.db.updateGlobalVariables = (variables) => {
      this.clientWorker.updateGlobalVariables(variables);
    };
  }

  get connectionStatus() {
    return this._connectionStatus;
  }

  query<CN extends CollectionNameFromModels<M>>(collectionName: CN) {
    return queryBuilder<M, CN>(collectionName);
  }

  async fetch<Q extends SchemaQuery<M>>(
    query: Q,
    options?: Partial<ClientFetchOptions>
  ) {
    await this.initialized;
    return this.clientWorker.fetch(query, options);
  }

  async transact<CN extends CollectionNameFromModels<M>, Output>(
    callback: TransactCallback<M, Output>,
    options: Partial<ClientTransactOptions> = {}
  ): Promise<Output> {
    await this.initialized;
    const client = this;
    const wrappedTxCallback: TransactCallback<M, Output> = async (tx) => {
      // create a proxy wrapper around TX that intercepts calls to tx.update that
      // normally takes a callback so instead we wrap with ComLink.proxy
      const proxiedTx = new Proxy(tx, {
        get(target, prop) {
          if (prop === 'update') {
            return async (
              collectionName: CN,
              id: string,
              update: UpdatePayload<M>
            ) => {
              const changes = await client.getChangesFromUpdatePayload(
                collectionName,
                id,
                update,
                tx.fetchById.bind(tx)
              );
              return await tx.update(collectionName, id, changes);
            };
          }
          // @ts-expect-error
          return target[prop];
        },
      });
      return await callback(proxiedTx);
    };
    return this.clientWorker.transact(
      ComLink.proxy(wrappedTxCallback),
      options
    ) as Promise<Output>;
  }

  // this takes all the requisite info to mock
  // a proxy on the client side that can be used
  // to update an entity and then pass the changes
  // to the worker
  private async getChangesFromUpdatePayload<
    CN extends CollectionNameFromModels<M>,
  >(
    collectionName: CN,
    id: string,
    update: UpdatePayload<M>,
    fetchById: (
      collectionName: CN,
      id: string
    ) => Promise<any | null> = this.fetchById.bind(this)
  ) {
    if (!collectionName) {
      throw new InvalidCollectionNameError(collectionName);
    }
    let changes = undefined;
    const collectionSchema = (await this.getSchema())?.collections[
      collectionName
    ].schema;
    if (typeof update === 'function') {
      const existingEntity = structuredClone(
        await fetchById(collectionName, id)
      );
      if (!existingEntity) {
        throw new EntityNotFoundError(id, collectionName);
      }
      changes = {};
      await update(
        createUpdateProxyAndTrackChanges(
          existingEntity,
          changes,
          collectionSchema
        )
      );
    } else {
      changes = update;
    }
    return changes;
  }

  async fetchById<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    id: string,
    options?: Partial<ClientFetchOptions>
  ) {
    await this.initialized;
    return this.clientWorker.fetchById(collectionName, id, options);
  }
  async fetchOne<Q extends SchemaQuery<M>>(
    query: Q,
    options?: Partial<ClientFetchOptions>
  ) {
    await this.initialized;
    return this.clientWorker.fetchOne(query, options);
  }
  async insert<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    object: WriteModel<M, CN>
  ) {
    await this.initialized;
    return this.clientWorker.insert(collectionName, object);
  }
  async update<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entityId: string,
    data: UpdatePayload<M, CN>
  ) {
    await this.initialized;
    const changes = await this.getChangesFromUpdatePayload(
      collectionName,
      entityId,
      data
    );
    return await this.clientWorker.update(collectionName, entityId, changes);
  }

  async delete<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entityId: string
  ) {
    await this.initialized;
    return this.clientWorker.delete(collectionName, entityId);
  }
  subscribe<Q extends SchemaQuery<M>>(
    query: Q,
    onResults: SubscriptionResultsCallback<M, Q>,
    onError?: (error: any) => void | Promise<void>,
    options?: Partial<SubscriptionOptions>
  ) {
    const unsubPromise = (async () => {
      await this.initialized;
      return this.clientWorker.subscribe(
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

  subscribeWithStatus<Q extends SchemaQuery<M>>(
    query: Q,
    callback: (state: SubscriptionSignalPayload<M, Q>) => void,
    options?: Partial<SubscriptionOptions>
  ): () => void {
    const unsubPromise = (async () => {
      await this.initialized;
      return this.clientWorker.subscribeWithStatus(
        query,
        ComLink.proxy(callback),
        options && ComLink.proxy(options)
      );
    })();
    return () => {
      unsubPromise.then((unsub) => unsub());
    };
  }

  subscribeBackground<Q extends SchemaQuery<M>>(
    query: Q,
    options: SubscribeBackgroundOptions = {}
  ) {
    const unsubPromise = (async () => {
      await this.initialized;
      return this.clientWorker.subscribeBackground(
        query,
        ComLink.proxy(options)
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
  subscribeWithPagination<Q extends SchemaQuery<M>>(
    query: Q,
    onResults: (
      results: FetchResult<M, Q, 'many'>,
      info: {
        hasNextPage: boolean;
        hasPreviousPage: boolean;
      }
    ) => void | Promise<void>,
    onError?: (error: any) => void | Promise<void>,
    options?: Partial<SubscriptionOptions>
  ): PaginatedSubscription {
    let unsubscribed = false;
    // @ts-expect-error
    const onRes = async (results, info) => {
      if (unsubscribed) return;
      onResults(results, info);
    };
    const subscriptionPromise = this.initialized.then(() =>
      this.clientWorker.subscribeWithPagination(
        query,
        ComLink.proxy(onRes),
        onError && ComLink.proxy(onError),
        options && ComLink.proxy(options)
      )
    );
    const unsubscribe = () => {
      unsubscribed = true;
      subscriptionPromise.then((sub) => {
        sub.unsubscribe();
      });
    };
    const nextPage = () => {
      subscriptionPromise.then((sub) => sub.nextPage());
    };
    const prevPage = () => {
      subscriptionPromise.then((sub) => sub.prevPage());
    };

    return { unsubscribe, nextPage, prevPage };
  }

  subscribeWithExpand<Q extends SchemaQuery<M>>(
    query: Q,
    onResults: (
      results: FetchResult<M, Q, 'many'>,
      info: {
        hasMore: boolean;
      }
    ) => void | Promise<void>,
    onError?: (error: any) => void | Promise<void>,
    options?: Partial<SubscriptionOptions>
  ): InfiniteSubscription {
    const subscriptionPromise = this.initialized.then(() =>
      this.clientWorker.subscribeWithExpand(
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

  async getSchema() {
    await this.initialized;
    return this.clientWorker.getSchema();
  }

  async updateServerUrl(serverUrl: string) {
    await this.initialized;
    return this.clientWorker.updateServerUrl(serverUrl);
  }

  async startSession(...args: Parameters<Client<M>['startSession']>) {
    await this.initialized;
    if (args[2]) args[2] = ComLink.proxy(args[2]);
    return this.clientWorker.startSession(...args);
  }

  async endSession(...args: Parameters<Client<M>['endSession']>) {
    await this.initialized;
    return this.clientWorker.endSession(...args);
  }

  // @ts-expect-error TODO
  async onSessionError(...args: Parameters<Client<M>['onSessionError']>) {
    await this.initialized;
    return this.clientWorker.onSessionError(ComLink.proxy(args[0]));
  }

  async updateSessionToken(
    ...args: Parameters<Client<M>['updateSessionToken']>
  ) {
    await this.initialized;
    return this.clientWorker.updateSessionToken(...args);
  }

  async isFirstTimeFetchingQuery(query: CollectionQuery): Promise<boolean> {
    await this.initialized;
    return this.clientWorker.isFirstTimeFetchingQuery(query);
  }

  onSyncMessageReceived(
    ...args: Parameters<typeof this.clientWorker.onSyncMessageReceived>
  ) {
    const unSubPromise = this.initialized.then(() =>
      this.clientWorker.onSyncMessageReceived(ComLink.proxy(args[0]))
    );
    return () => unSubPromise.then((unsub) => unsub());
  }
  onSyncMessageSent(
    ...args: Parameters<typeof this.clientWorker.onSyncMessageSent>
  ) {
    const unSubPromise = this.initialized.then(() =>
      this.clientWorker.onSyncMessageSent(ComLink.proxy(args[0]))
    );
    return () => unSubPromise.then((unsub) => unsub());
  }
  onEntitySyncSuccess(
    ...args: Parameters<typeof this.clientWorker.onEntitySyncSuccess>
  ) {
    const unSubPromise = this.initialized.then(() =>
      this.clientWorker.onEntitySyncSuccess(
        args[0],
        args[1],
        ComLink.proxy(args[2])
      )
    );
    return () => unSubPromise.then((unsub) => unsub());
  }
  onEntitySyncError(
    ...args: Parameters<typeof this.clientWorker.onEntitySyncError>
  ) {
    const unSubPromise = this.initialized.then(() =>
      this.clientWorker.onEntitySyncError(
        args[0],
        args[1],
        ComLink.proxy(args[2])
      )
    );
    return () => unSubPromise.then((unsub) => unsub());
  }

  onFailureToSyncWrites(callback: (e: unknown) => void): () => void {
    const unSubPromise = this.initialized.then(() =>
      this.clientWorker.onFailureToSyncWrites(ComLink.proxy(callback))
    );
    return () => unSubPromise.then((unsub) => unsub());
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
  async syncWrites() {
    await this.initialized;
    return this.clientWorker.syncWrites();
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

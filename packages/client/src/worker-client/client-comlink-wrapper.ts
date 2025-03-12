import * as ComLink from 'comlink';
import {
  TriplitClient as Client,
  ClientOptions,
} from '../client/triplit-client.js';
import { LogLevel } from '../@triplit/types/logger.js';
import { DefaultLogger } from '../client-logger.js';
import { WorkerInternalClientNotInitializedError } from '../errors.js';
import {
  SubscribeBackgroundOptions,
  SubscriptionOptions,
} from '../client/types';
import {
  ClearOptions,
  CollectionNameFromModels,
  CollectionQuery,
  Models,
  ReadModel,
  SchemaQuery,
} from '@triplit/db';
import { ClientTransactOptions } from '../client/types/client.js';

interface ClientWorker<M extends Models<M> = Models>
  extends Omit<Client<M>, 'update' | 'transact'> {
  init: (options: ClientOptions<M>, logger: any) => void;
  update: <CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entityId: string,
    data: Partial<ReadModel<M, CN>>
  ) => Promise<void>;
  transact: <Output>(
    callback: string,
    options?: Partial<ClientTransactOptions>
  ) => Promise<Output>;
}

class WorkerLogger {
  logScope: string | undefined;
  constructor(opts: { scope?: string; level: LogLevel }) {
    this.logScope = opts.scope;
  }
}

export class ClientComlinkWrapper<M extends Models<M> = Models>
  implements ClientWorker<M>
{
  public client: Client<M> | null = null;
  constructor() {}
  init(options: ClientOptions<M>, logger: any) {
    if (this.client != undefined) return;
    const { schema, logLevel, token, autoConnect, ...remainingOptions } =
      options;
    const workerLogger = new DefaultLogger({
      level: logLevel,
      onLog: (log) => {
        if (!logger) return;
        if (log.scope == undefined) {
          log.scope = '';
        }
        switch (log.level) {
          case 'error':
            logger.error(log);
            break;
          case 'warn':
            logger.warn(log);
            break;
          case 'info':
            logger.info(log);
            break;
          case 'debug':
            logger.debug(log);
            break;
        }
      },
    });
    this.client = new Client<M>({
      ...remainingOptions,
      schema: schema,
      logger: workerLogger,
    });
  }
  async fetch(...args: Parameters<Client<M>['fetch']>) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return await this.client.fetch(...args);
  }
  // @ts-expect-error
  async transact(...args: Parameters<Client<M>['transact']>) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return await this.client.transact(
      (tx) => args[0](ComLink.proxy(tx)),
      args[1]
    );
  }
  async fetchById(...args: Parameters<Client<M>['fetchById']>): Promise<any> {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return await this.client.fetchById(...args);
  }
  async fetchOne(...args: Parameters<Client<M>['fetchOne']>) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return await this.client.fetchOne(...args);
  }
  async insert(...args: Parameters<Client<M>['insert']>) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return await this.client.insert(...args);
  }
  async update<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entityId: string,
    data: Partial<ReadModel<M, CN>>
  ) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return await this.client.update(collectionName, entityId, data);
  }
  async getSchema() {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return await this.client.getSchema();
  }
  async delete(...args: Parameters<Client<M>['delete']>) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return await this.client.delete(...args);
  }
  // @ts-expect-error
  async subscribe(...args: Parameters<Client<M>['subscribe']>) {
    args[3] = await normalizeSubscriptionOptions(
      args[3] as ComLink.Remote<(typeof args)[3]>
    );
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return ComLink.proxy(this.client.subscribe(...args));
  }
  // @ts-expect-error
  async subscribeBackground<Q extends SchemaQuery<M>>(
    query: Q,
    options: SubscribeBackgroundOptions = {}
  ) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return ComLink.proxy(this.client.subscribeBackground(query, options));
  }
  // @ts-expect-error
  async subscribeWithPagination(
    ...args: Parameters<Client<M>['subscribeWithPagination']>
  ) {
    args[3] = await normalizeSubscriptionOptions(
      args[3] as ComLink.Remote<(typeof args)[3]>
    );
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return ComLink.proxy(this.client.subscribeWithPagination(...args));
  }
  // @ts-expect-error
  async subscribeWithExpand(
    ...args: Parameters<Client<M>['subscribeWithExpand']>
  ) {
    args[3] = await normalizeSubscriptionOptions(
      args[3] as ComLink.Remote<(typeof args)[3]>
    );
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return ComLink.proxy(this.client.subscribeWithExpand(...args));
  }

  // @ts-expect-error
  async subscribeWithStatus(
    ...args: Parameters<Client<M>['subscribeWithStatus']>
  ) {
    args[2] = await normalizeSubscriptionOptions(
      args[2] as ComLink.Remote<(typeof args)[2]>
    );
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return ComLink.proxy(this.client.subscribeWithStatus(...args));
  }

  async startSession(...args: Parameters<Client<M>['startSession']>) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    const normalizedOptions = await normalizeStartSessionOptions(
      args[2] as ComLink.Remote<(typeof args)[2]>
    );
    const unsubCallback = await this.client.startSession(
      args[0],
      args[1],
      normalizedOptions
    );
    if (unsubCallback == undefined) return;
    return ComLink.proxy(unsubCallback);
  }

  async endSession(...args: Parameters<Client<M>['endSession']>) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return await this.client.endSession(...args);
  }

  updateSessionToken(...args: Parameters<Client<M>['updateSessionToken']>) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return this.client.updateSessionToken(...args);
  }

  onSessionError(...args: Parameters<Client<M>['onSessionError']>) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return ComLink.proxy(this.client.onSessionError(...args));
  }

  updateServerUrl(
    ...args: Parameters<Client<M>['updateServerUrl']>
  ): Promise<void> {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();

    return this.client.updateServerUrl(...args);
  }

  onSyncMessageReceived(
    ...args: Parameters<
      NonNullable<typeof this.client>['onSyncMessageReceived']
    >
  ) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return ComLink.proxy(this.client.onSyncMessageReceived(...args));
  }

  onSyncMessageSent(
    ...args: Parameters<NonNullable<typeof this.client>['onSyncMessageSent']>
  ) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return ComLink.proxy(this.client.onSyncMessageSent(...args));
  }

  onEntitySyncSuccess(
    ...args: Parameters<NonNullable<typeof this.client>['onEntitySyncSuccess']>
  ) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return ComLink.proxy(this.client.onEntitySyncSuccess(...args));
  }

  onEntitySyncError(
    ...args: Parameters<NonNullable<typeof this.client>['onEntitySyncError']>
  ) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return ComLink.proxy(this.client.onEntitySyncError(...args));
  }

  onFailureToSyncWrites(callback: (e: unknown) => void): () => void {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return ComLink.proxy(this.client.onFailureToSyncWrites(callback));
  }

  onConnectionStatusChange(
    ...args: Parameters<
      NonNullable<typeof this.client>['onConnectionStatusChange']
    >
  ) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return ComLink.proxy(this.client.onConnectionStatusChange(...args));
  }
  connect() {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return this.client.connect();
  }
  disconnect() {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return this.client.disconnect();
  }
  syncWrites(...args: Parameters<Client<M>['syncWrites']>) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return this.client.syncWrites(...args);
  }
  isFirstTimeFetchingQuery(query: CollectionQuery<any, any>): Promise<boolean> {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return this.client.isFirstTimeFetchingQuery(query);
  }
  updateGlobalVariables(
    ...args: Parameters<Client<M>['db']['updateGlobalVariables']>
  ) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return this.client.db.updateGlobalVariables(...args);
  }
  async clear(options: ClearOptions = {}) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return await this.client.clear(options);
  }
  async reset(options: ClearOptions = {}) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return await this.client.reset(options);
  }
}

async function normalizeSubscriptionOptions(
  options: ComLink.Remote<Partial<SubscriptionOptions>>
): Promise<Partial<SubscriptionOptions>> {
  if (options == undefined) return {};
  return {
    // localOnly: await options.localOnly,
    // noCache: await options.noCache,
    onRemoteFulfilled: await options.onRemoteFulfilled,
  };
}

async function normalizeStartSessionOptions<M extends Models<M> = Models>(
  options: ComLink.Remote<Parameters<Client<M>['startSession']>[2]>
): Promise<Parameters<Client<M>['startSession']>[2]> {
  if (options == undefined) return undefined;
  return {
    interval: await options.interval,
    refreshHandler: options.refreshHandler,
  };
}

import * as ComLink from 'comlink';
import {
  TriplitClient as Client,
  ClientOptions,
  SubscriptionOptions,
} from '../client/triplit-client.js';
import {
  Attribute,
  CollectionNameFromModels,
  JSONToSchema,
  ModelFromModels,
  UpdateTypeFromModel,
  TupleValue,
  CollectionQuery,
  TransactionResult,
  ClearOptions,
} from '@triplit/db';
import { LogLevel } from '@triplit/types/logger';
import { DefaultLogger } from '../client-logger.js';
import { WorkerInternalClientNotInitializedError } from '../errors.js';

interface ClientWorker extends Client {
  init: (options: ClientOptions, logger: any) => void;
}

type NonNullableClient = NonNullable<Client>;

class WorkerLogger {
  logScope: string | undefined;
  constructor(opts: { scope?: string; level: LogLevel }) {
    this.logScope = opts.scope;
  }
}

export class ClientComlinkWrapper implements ClientWorker {
  public client: Client | null = null;
  constructor() {}
  init(options: ClientOptions, logger: any) {
    if (this.client != undefined) return;
    const { schema } = options;
    const workerLogger = new DefaultLogger({
      level: options.logLevel,
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
    this.client = new Client({
      ...options,
      // TODO - Is the schema in a json format here? Its not typed that way...
      schema: JSONToSchema(schema as any)?.collections,
      logger: workerLogger,
    });
  }
  // @ts-expect-error
  async fetch(...args: Parameters<NonNullableClient['fetch']>) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return await this.client.fetch(...args);
  }
  // @ts-expect-error
  async transact(...args: Parameters<NonNullableClient['transact']>) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return await this.client.transact((tx) => args[0](ComLink.proxy(tx)));
  }
  async fetchById(
    ...args: Parameters<NonNullableClient['fetchById']>
  ): Promise<any> {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return await this.client.fetchById(...args);
  }
  // @ts-expect-error
  async fetchOne(...args: Parameters<NonNullableClient['fetchOne']>) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return await this.client.fetchOne(...args);
  }
  async insert(
    ...args: Parameters<NonNullableClient['insert']>
  ): Promise<TransactionResult<any>> {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return await this.client.insert(...args);
  }
  async update<CN extends CollectionNameFromModels<any>>(
    collectionName: CN,
    entityId: string,
    updater: (entity: UpdateTypeFromModel<any>) => void | Promise<void>
  ): Promise<TransactionResult<void>> {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return await this.client.update(collectionName, entityId, async (ent) => {
      const proxyOfProxy = ComLink.proxy(ent);
      await updater(proxyOfProxy);
    });
  }
  async updateRaw<CN extends CollectionNameFromModels<any>>(
    collectionName: CN,
    entityId: string,
    updater: (
      entity: Record<string, any>
    ) => [Attribute, TupleValue][] | Promise<[Attribute, TupleValue][]>
  ): Promise<TransactionResult<void>> {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return await this.client.updateRaw(collectionName, entityId, updater);
  }
  async getSchema() {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return await this.client.getSchema();
  }
  async getSchemaJson() {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return await this.client.getSchemaJson();
  }
  async delete(
    ...args: Parameters<NonNullableClient['delete']>
  ): Promise<TransactionResult<void>> {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return await this.client.delete(...args);
  }
  // @ts-expect-error
  async subscribe(...args: Parameters<NonNullableClient['subscribe']>) {
    args[3] = await normalizeSubscriptionOptions(
      args[3] as ComLink.Remote<(typeof args)[3]>
    );
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return ComLink.proxy(this.client.subscribe(...args));
  }
  // @ts-expect-error
  async subscribeWithPagination(
    ...args: Parameters<NonNullableClient['subscribe']>
  ) {
    args[3] = await normalizeSubscriptionOptions(
      args[3] as ComLink.Remote<(typeof args)[3]>
    );
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return ComLink.proxy(this.client.subscribeWithPagination(...args));
  }
  // @ts-expect-error
  async subscribeWithExpand(
    ...args: Parameters<NonNullableClient['subscribe']>
  ) {
    args[3] = await normalizeSubscriptionOptions(
      args[3] as ComLink.Remote<(typeof args)[3]>
    );
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return ComLink.proxy(this.client.subscribeWithExpand(...args));
  }
  updateOptions(...args: Parameters<NonNullableClient['updateOptions']>): void {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();

    this.client.updateOptions(...args);
  }
  updateToken(...args: Parameters<NonNullableClient['updateToken']>): void {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();

    this.client.updateToken(...args);
  }
  updateServerUrl(
    ...args: Parameters<NonNullableClient['updateServerUrl']>
  ): void {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();

    this.client.updateServerUrl(...args);
  }
  onTxCommitRemote(...args: Parameters<NonNullableClient['onTxCommitRemote']>) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return ComLink.proxy(this.client.onTxCommitRemote(...args));
  }
  onTxFailureRemote(
    ...args: Parameters<NonNullableClient['onTxFailureRemote']>
  ) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return ComLink.proxy(this.client.onTxFailureRemote(...args));
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
  retry(...args: Parameters<NonNullableClient['retry']>) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return this.client.retry(...args);
  }
  rollback(...args: Parameters<NonNullableClient['rollback']>) {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return this.client.rollback(...args);
  }
  isFirstTimeFetchingQuery(query: CollectionQuery<any, any>): Promise<boolean> {
    if (!this.client) throw new WorkerInternalClientNotInitializedError();
    return this.client.isFirstTimeFetchingQuery(query);
  }
  updateGlobalVariables(
    ...args: Parameters<NonNullableClient['db']['updateGlobalVariables']>
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
    localOnly: await options.localOnly,
    noCache: await options.noCache,
    // @ts-expect-error
    onRemoteFulfilled: options.onRemoteFulfilled,
  };
}

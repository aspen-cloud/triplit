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
  TriplitError,
  TransactionResult,
} from '@triplit/db';
import { LogLevel } from '@triplit/types/logger';
import { DefaultLogger } from '../client-logger.js';

let clientOperator: Client;

interface ClientWorker extends Client {
  init: (options: any) => void;
}

class WorkerLogger {
  logScope: string | undefined;
  constructor(opts: { scope?: string; level: LogLevel }) {
    this.logScope = opts.scope;
  }
}

const workerOperator: ClientWorker = {
  // @ts-expect-error
  init: (options: ClientOptions<any>, logger) => {
    if (clientOperator != undefined) return;
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
    // @ts-expect-error
    clientOperator = new Client({
      ...options,
      schema: JSONToSchema(schema)?.collections,
      logger: workerLogger,
    });
  },
  fetch: async (...args: Parameters<typeof clientOperator.fetch>) =>
    await clientOperator.fetch(...args),
  // @ts-ignore
  async transact(...args: Parameters<typeof clientOperator.transact>) {
    return await clientOperator.transact((tx) => args[0](ComLink.proxy(tx)));
  },
  async fetchById(
    ...args: Parameters<typeof clientOperator.fetchById>
  ): Promise<any> {
    return await clientOperator.fetchById(...args);
  },
  async fetchOne(...args: Parameters<typeof clientOperator.fetchOne>) {
    return await clientOperator.fetchOne(...args);
  },
  async insert(
    ...args: Parameters<typeof clientOperator.insert>
  ): Promise<TransactionResult<any>> {
    return await clientOperator.insert(...args);
  },
  async update<CN extends CollectionNameFromModels<any>>(
    collectionName: CN,
    entityId: string,
    updater: (entity: UpdateTypeFromModel<any>) => void | Promise<void>
  ): Promise<TransactionResult<void>> {
    return await clientOperator.update(
      collectionName,
      entityId,
      async (ent) => {
        const proxyOfProxy = ComLink.proxy(ent);
        await updater(proxyOfProxy);
      }
    );
  },
  async updateRaw<CN extends CollectionNameFromModels<any>>(
    collectionName: CN,
    entityId: string,
    updater: (
      entity: UpdateTypeFromModel<ModelFromModels<any, CN>>
    ) => [Attribute, TupleValue][] | Promise<[Attribute, TupleValue][]>
  ): Promise<TransactionResult<void>> {
    return await clientOperator.updateRaw(collectionName, entityId, updater);
  },
  async getSchema() {
    return await clientOperator.getSchema();
  },
  async delete(
    ...args: Parameters<typeof clientOperator.delete>
  ): Promise<TransactionResult<void>> {
    return await clientOperator.delete(...args);
  },
  // @ts-ignore
  async subscribe(...args: Parameters<typeof clientOperator.subscribe>) {
    args[3] = await normalizeSubscriptionOptions(
      args[3] as ComLink.Remote<(typeof args)[3]>
    );
    return ComLink.proxy(clientOperator.subscribe(...args));
  },
  // @ts-ignore
  async subscribeWithPagination(
    ...args: Parameters<typeof clientOperator.subscribe>
  ) {
    args[3] = await normalizeSubscriptionOptions(
      args[3] as ComLink.Remote<(typeof args)[3]>
    );
    return ComLink.proxy(clientOperator.subscribeWithPagination(...args));
  },
  // @ts-ignore
  async subscribeWithExpand(
    ...args: Parameters<typeof clientOperator.subscribe>
  ) {
    args[3] = await normalizeSubscriptionOptions(
      args[3] as ComLink.Remote<(typeof args)[3]>
    );
    return ComLink.proxy(clientOperator.subscribeWithExpand(...args));
  },
  updateOptions(
    ...args: Parameters<typeof clientOperator.updateOptions>
  ): void {
    clientOperator.updateOptions(...args);
  },
  updateToken(...args: Parameters<typeof clientOperator.updateToken>): void {
    clientOperator.updateToken(...args);
  },
  updateServerUrl(
    ...args: Parameters<typeof clientOperator.updateServerUrl>
  ): void {
    clientOperator.updateServerUrl(...args);
  },
  onTxCommitRemote(
    ...args: Parameters<typeof clientOperator.onTxCommitRemote>
  ) {
    return ComLink.proxy(clientOperator.onTxCommitRemote(...args));
  },
  onTxFailureRemote(
    ...args: Parameters<typeof clientOperator.onTxFailureRemote>
  ) {
    return ComLink.proxy(clientOperator.onTxFailureRemote(...args));
  },
  onConnectionStatusChange(
    ...args: Parameters<typeof this.syncEngine.onConnectionStatusChange>
  ) {
    return ComLink.proxy(clientOperator.onConnectionStatusChange(...args));
  },
  connect() {
    return clientOperator.connect();
  },
  disconnect() {
    return clientOperator.disconnect();
  },
  retry(...args: Parameters<typeof clientOperator.retry>) {
    return clientOperator.retry(...args);
  },
  rollback(...args: Parameters<typeof clientOperator.rollback>) {
    return clientOperator.rollback(...args);
  },
  isFirstTimeFetchingQuery(query: CollectionQuery<any, any>): Promise<boolean> {
    return clientOperator.isFirstTimeFetchingQuery(query);
  },
  updateGlobalVariables(
    ...args: Parameters<typeof clientOperator.db.updateGlobalVariables>
  ) {
    return clientOperator.db.updateGlobalVariables(...args);
  },
  async clear() {
    return await clientOperator.clear();
  },
};

async function normalizeSubscriptionOptions(
  options: ComLink.Remote<Partial<SubscriptionOptions>>
): Promise<Partial<SubscriptionOptions>> {
  if (options == undefined) return {};
  return {
    localOnly: await options.localOnly,
    noCache: await options.noCache,
    // @ts-ignore
    onRemoteFulfilled: options.onRemoteFulfilled,
  };
}

// @ts-ignore
self.addEventListener('connect', (evt: MessageEvent) => {
  const port = evt.ports[0];
  ComLink.expose(workerOperator, port);
});

ComLink.expose(workerOperator);

import * as ComLink from 'comlink';
import { TriplitClient as Client } from './triplit-client.js';
import { ClientQuery } from './index.js';
import { ClientFetchResultEntity } from './utils/query.js';
import {
  Attribute,
  CollectionNameFromModels,
  DBTransaction,
  JSONToSchema,
  ModelFromModels,
  UpdateTypeFromModel,
  TupleValue,
} from '@triplit/db';

// onconnect = function (event) {
//   const port = event.ports[0];

//   Comlink.expose(obj, port);
// };

let clientOperator: Client;

interface ClientWorker extends Client {
  init: (options: any) => void;
}

// @ts-ignore
const workerOperator: ClientWorker = {
  init: (options) => {
    if (clientOperator != undefined) return;
    const { schema } = options;
    clientOperator = new Client({
      ...options,
      schema: JSONToSchema(schema)?.collections,
    });
  },
  fetch: async (...args) => await clientOperator.fetch(...args),
  // @ts-ignore
  async transact<Output>(callback: (tx: DBTransaction<M>) => Promise<Output>) {
    // @ts-ignore
    return await clientOperator.transact((tx) => callback(ComLink.proxy(tx)));
  },
  // @ts-ignore
  fetchById: async function <CN extends string>(...args): Promise<any> {
    // @ts-ignore
    return await clientOperator.fetchById(...args);
  },
  fetchOne: async function <CQ extends ClientQuery<undefined, any>>(
    // @ts-ignore
    ...args
  ): Promise<ClientFetchResultEntity<CQ> | null> {
    // @ts-ignore
    return await clientOperator.fetchOne(...args);
  },
  insert: async function <CN extends string>(
    // @ts-ignore
    ...args
  ): Promise<{ txId: string | undefined; output: any }> {
    // @ts-ignore
    return await clientOperator.insert(...args);
  },
  async update<CN extends CollectionNameFromModels<any>>(
    collectionName: CN,
    entityId: string,
    updater: (entity: UpdateTypeFromModel<any>) => void | Promise<void>
  ): Promise<{ txId: string | undefined; output: void | undefined }> {
    console.log('update', collectionName, entityId, updater);
    // @ts-ignore
    return await clientOperator.update(
      collectionName,
      entityId,
      async (ent) => {
        console.log('updater', updater);
        console.log('ent', ent);
        const proxyOfProxy = ComLink.proxy(ent);
        console.log('proxyOfProxy', proxyOfProxy);
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
  ): Promise<{ txId: string | undefined; output: void | undefined }> {
    return await clientOperator.updateRaw(collectionName, entityId, updater);
  },
  getSchema: async function (): Promise<any> {
    return await clientOperator.getSchema();
  },
  delete: async function <CN extends string>(
    // @ts-ignore
    ...args
  ): Promise<{ txId: string | undefined; output: void | undefined }> {
    // @ts-ignore
    return await clientOperator.delete(...args);
  },
  subscribe: function <CQ extends ClientQuery<undefined, any>>(
    // @ts-ignore
    ...args
  ): () => void {
    // @ts-ignore
    return ComLink.proxy(clientOperator.subscribe(...args));
  },
  subscribeWithPagination: function <CQ extends ClientQuery<undefined, any>>(
    // @ts-ignore
    ...args
  ): { unsubscribe: () => void; nextPage: () => void; prevPage: () => void } {
    // @ts-ignore
    return clientOperator.subscribeWithPagination(...args);
  },
  subscribeWithExpand: function <CQ extends ClientQuery<undefined, any>>(
    // @ts-ignore
    ...args
  ): {
    unsubscribe: () => void;
    loadMore: (pageSize?: number | undefined) => void;
  } {
    // @ts-ignore
    return clientOperator.subscribeWithExpand(...args);
  },
  updateOptions: function (...args): void {
    clientOperator.updateOptions(...args);
  },
  updateToken: function (...args): void {
    clientOperator.updateToken(...args);
  },
  updateServerUrl: function (...args): void {
    clientOperator.updateServerUrl(...args);
  },

  onTxCommitRemote(txId: string, callback: () => void) {
    return ComLink.proxy(clientOperator.onTxCommitRemote(txId, callback));
  },
  onTxFailureRemote(txId: string, callback: () => void) {
    return ComLink.proxy(clientOperator.onTxFailureRemote(txId, callback));
  },
  onConnectionStatusChange(
    ...args: Parameters<typeof this.syncEngine.onConnectionStatusChange>
  ) {
    return ComLink.proxy(clientOperator.onConnectionStatusChange(...args));
  },
};

// @ts-ignore
self.addEventListener('connect', (evt: MessageEvent) => {
  const port = evt.ports[0];
  ComLink.expose(workerOperator, port);
});

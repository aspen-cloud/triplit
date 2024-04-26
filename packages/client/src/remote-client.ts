import {
  UpdateTypeFromModel,
  Models,
  CollectionNameFromModels,
  ModelFromModels,
  InsertTypeFromModel,
  FetchByIdQueryParams,
  ChangeTracker,
  createUpdateProxy,
  Attribute,
  TupleValue,
  TriplitError,
  EntityId,
  constructEntity,
  TripleRow,
  timestampedObjectToPlainObject,
  appendCollectionToId,
} from '@triplit/db';
import {
  ClientFetchResult,
  ClientFetchResultEntity,
  ClientQuery,
  ClientSchema,
  RemoteClientQueryBuilder,
  prepareFetchByIdQuery,
  prepareFetchOneQuery,
} from './utils/query.js';

function parseError(error: string) {
  try {
    const jsonError = JSON.parse(error);
    return TriplitError.fromJson(jsonError);
  } catch (e) {
    return new TriplitError(`Failed to parse remote error response: ${error}`);
  }
}

export type RemoteClientOptions<M extends ClientSchema | undefined> = {
  server?: string;
  token?: string;
  schema?: M;
  schemaFactory?: () => M | Promise<M>;
};

// Interact with remote via http api, totally separate from your local database
export class RemoteClient<M extends ClientSchema | undefined> {
  constructor(private options: RemoteClientOptions<M>) {}

  // Hack: use schemaFactory to get schema if it's not ready from provider
  private async schema() {
    return this.options.schema || (await this.options.schemaFactory?.());
  }

  updateOptions(options: RemoteClientOptions<M>) {
    this.options = { ...this.options, ...options };
  }

  private async sendRequest(
    uri: string,
    method: string,
    body: any,
    options: { isFile?: boolean } = { isFile: false }
  ) {
    if (!this.options.server) throw new TriplitError('No server url provided');
    if (!this.options.token) throw new TriplitError('No token provided');
    const headers: HeadersInit = {
      Authorization: 'Bearer ' + this.options.token,
      'Content-Type': 'application/json',
    };
    const stringifiedBody = JSON.stringify(body);

    let form;
    if (options.isFile) {
      form = new FormData();
      form.append('data', stringifiedBody);
      delete headers['Content-Type'];
    }

    const res = await fetch(this.options.server + uri, {
      method,
      headers,
      body: options.isFile ? form : stringifiedBody,
    });

    if (!res.ok)
      return { data: undefined, error: parseError(await res.text()) };
    return { data: await res.json(), error: undefined };
  }

  async fetch<CQ extends ClientQuery<M, any>>(
    query: CQ
  ): Promise<ClientFetchResult<CQ>> {
    const { data, error } = await this.sendRequest('/fetch', 'POST', {
      query,
    });
    if (error) throw error;
    return deserializeHTTPFetchResult(query, data.result, await this.schema());
  }

  private async queryTriples<CQ extends ClientQuery<M, any>>(
    query: CQ
  ): Promise<TripleRow[]> {
    const { data, error } = await this.sendRequest('/queryTriples', 'POST', {
      query,
    });
    if (error) throw error;
    return data;
  }

  async fetchOne<CQ extends ClientQuery<M, any>>(
    query: CQ
  ): Promise<ClientFetchResultEntity<CQ> | null> {
    query = prepareFetchOneQuery(query);
    const { data, error } = await this.sendRequest('/fetch', 'POST', {
      query,
    });
    if (error) throw error;
    const deserialized = deserializeHTTPFetchResult(
      query,
      data.result,
      await this.schema()
    );
    const entity = [...deserialized.values()][0];
    if (!entity) return null;
    return entity;
  }

  async fetchById<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    id: string,
    queryParams?: FetchByIdQueryParams<M, CN>
  ) {
    const query = prepareFetchByIdQuery(collectionName, id, queryParams);
    const { data, error } = await this.sendRequest('/fetch', 'POST', {
      query,
    });
    if (error) throw error;
    const deserialized = deserializeHTTPFetchResult(
      query,
      data.result,
      await this.schema()
    );
    return deserialized.get(id);
  }

  async insert<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    object: InsertTypeFromModel<ModelFromModels<M, CN>>
  ) {
    // we need to convert Sets to arrays before sending to the server
    const schema = await this.schema();
    const collectionSchema = schema?.[collectionName]?.schema;
    const jsonEntity = collectionSchema
      ? Object.fromEntries(
          Object.entries(object).map(([attribute, value]) => [
            attribute,
            collectionSchema.properties[attribute].convertJSToJSON(
              value,
              schema
            ),
          ])
        )
      : object;
    const { data, error } = await this.sendRequest('/insert', 'POST', {
      collectionName,
      entity: jsonEntity,
    });
    if (error) throw error;
    return data;
  }

  async bulkInsert(bulk: BulkInsert<M>) {
    // we need to convert Sets to arrays before sending to the server
    const schema = await this.schema();
    const jsonBulkInsert = schema
      ? Object.fromEntries(
          Object.entries(bulk).map(([collectionName, entities]) => [
            collectionName,
            entities?.map((entity: any) =>
              Object.fromEntries(
                Object.entries(entity).map(([attribute, value]) => [
                  attribute,
                  schema[collectionName]?.schema.properties[
                    attribute
                  ].convertJSToJSON(value, schema),
                ])
              )
            ),
          ])
        )
      : bulk;

    const { data, error } = await this.sendRequest(
      '/bulk-insert-file',
      'POST',
      jsonBulkInsert,
      { isFile: true }
    );
    if (error) throw error;
    return data;
  }

  async insertTriples(triples: any[]) {
    const { data, error } = await this.sendRequest('/insert-triples', 'POST', {
      triples,
    });
    if (error) throw error;
    return data;
  }

  async deleteTriples(entityAttributes: [EntityId, Attribute][]) {
    const { data, error } = await this.sendRequest('/delete-triples', 'POST', {
      entityAttributes,
    });
    if (error) throw error;
    return data;
  }

  async update<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entityId: string,
    updater: (
      entity: UpdateTypeFromModel<ModelFromModels<M, CN>>
    ) => void | Promise<void>
  ) {
    /**
     * This queries the current entity so we can construct "patches"
     * Patches are basically tuples (ie triples w/o timestamps), so we should just call them tuples
     * The way our updater works right now, non assignment operations (ie set.add(), etc) should have their value loaded as to not conflict with possibly "undefined" values in the proxy
     * We should refactor this though, because we shouldnt require pre-loading data to make an update (@wernst has some ideas)
     */
    const schema = await this.schema();
    const collectionSchema = schema?.[collectionName]?.schema;
    const entityQuery = prepareFetchByIdQuery<M, CN>(collectionName, entityId);
    const triples = await this.queryTriples(entityQuery);
    // TODO we should handle errors or non-existent entities
    const entity = constructEntity(
      triples,
      appendCollectionToId(collectionName, entityId)
    );
    const entityData = timestampedObjectToPlainObject(entity?.data as any);
    const changes = new ChangeTracker(entityData);
    const updateProxy: any = createUpdateProxy(
      changes,
      entityData,
      schema,
      collectionName
    );
    await updater(updateProxy);
    const changeTuples = changes.getTuples();
    const patches: (['delete', Attribute] | ['set', Attribute, TupleValue])[] =
      changeTuples.map((tuple) => {
        if (tuple[1] === undefined)
          return ['delete', tuple[0]] as ['delete', Attribute];
        return ['set', tuple[0], tuple[1]] as ['set', Attribute, TupleValue];
      });
    const { data, error } = await this.sendRequest('/update', 'POST', {
      collectionName,
      entityId,
      patches,
    });
    if (error) throw error;
    return data;
  }

  async delete<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entityId: string
  ) {
    const { data, error } = await this.sendRequest('/delete', 'POST', {
      collectionName,
      entityId,
    });
    if (error) throw error;
    return data;
  }

  query<CN extends CollectionNameFromModels<M>>(
    collectionName: CN
  ): RemoteClientQueryBuilder<M, CN> {
    return RemoteClientQueryBuilder<M, CN>(collectionName);
  }
}

function deserializeHTTPFetchResult<CQ extends ClientQuery<any, any>>(
  query: CQ,
  result: [string, any][],
  schema?: any
): ClientFetchResult<CQ> {
  return new Map(
    result.map((entry) => [
      entry[0],
      deserializeHTTPEntity(query, entry[1], schema),
    ])
  );
}

function deserializeHTTPEntity<CQ extends ClientQuery<any, any>>(
  query: CQ,
  entity: any,
  schema?: any
): ClientFetchResultEntity<CQ> {
  const { include, collectionName } = query;
  const collectionSchema = schema?.[collectionName]?.schema;

  const deserializedEntity = collectionSchema
    ? (collectionSchema.convertJSONToJS(
        entity,
        schema
      ) as ClientFetchResultEntity<CQ>)
    : entity;
  return deserializedEntity;
}

export type BulkInsert<M extends ClientSchema | undefined> =
  M extends ClientSchema
    ? {
        [CN in CollectionNameFromModels<M>]?: InsertTypeFromModel<
          ModelFromModels<M, CN>
        >[];
      }
    : Record<string, any>;

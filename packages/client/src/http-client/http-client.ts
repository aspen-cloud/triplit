import {
  CollectionNameFromModels,
  createUpdateProxyAndTrackChanges,
  deserializeEntity,
  deserializeFetchResult,
  EntityNotFoundError,
  FetchResult,
  Models,
  queryBuilder,
  ReadModel,
  SchemaQuery,
  serializeEntity,
  TriplitError,
  Type,
  UpdatePayload,
  WriteModel,
} from '@triplit/entity-db';

function parseError(error: string) {
  try {
    const jsonError = JSON.parse(error);
    return TriplitError.fromJson(jsonError);
  } catch (e) {
    return new TriplitError(`Failed to parse remote error response: ${error}`);
  }
}

export type HttpClientOptions<M extends Models<M> = Models> = {
  serverUrl?: string;
  token?: string;
  schema?: M;
  schemaFactory?: () => M | Promise<M>;
};

// Interact with remote via http api, totally separate from your local database
export class HttpClient<M extends Models<M> = Models> {
  constructor(private options: HttpClientOptions<M> = {}) {}

  // Hack: use schemaFactory to get schema if it's not ready from provider
  private async schema() {
    return this.options.schema || (await this.options.schemaFactory?.());
  }

  updateOptions(options: HttpClientOptions<M>) {
    this.options = { ...this.options, ...options };
  }

  private async sendRequest(
    uri: string,
    method: string,
    body: any,
    options: { isFile?: boolean } = { isFile: false }
  ) {
    const serverUrl = this.options.serverUrl;
    if (!serverUrl) throw new TriplitError('No server url provided');
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

    const res = await fetch(serverUrl + uri, {
      method,
      headers,
      body: options.isFile ? form : stringifiedBody,
    });

    if (!res.ok)
      return { data: undefined, error: parseError(await res.text()) };
    return { data: await res.json(), error: undefined };
  }

  async fetch<Q extends SchemaQuery<M>>(
    query: Q
  ): Promise<FetchResult<M, Q, 'many'>> {
    const { data, error } = await this.sendRequest('/fetch', 'POST', {
      query,
    });
    if (error) throw error;
    return deserializeFetchResult(
      query,
      await this.schema(),
      data.map((entity: any) => entity[1])
    ) as FetchResult<M, Q, 'many'>;
  }

  async fetchOne<Q extends SchemaQuery<M>>(
    query: Q
  ): Promise<FetchResult<M, Q, 'one'>> {
    query = { ...query, limit: 1 };
    const { data, error } = await this.sendRequest('/fetch', 'POST', {
      query,
    });
    if (error) throw error;
    const deserialized = deserializeFetchResult(
      query,
      await this.schema(),
      data.map((entity: any) => entity[1])
    );
    const entity = deserialized[0];
    if (!entity) return null;
    return entity as NonNullable<FetchResult<M, Q, 'one'>>;
  }

  async fetchById<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    id: string
  ): Promise<FetchResult<M, { collectionName: CN }, 'one'>> {
    const query = this.query(collectionName).Id(id);
    return this.fetchOne<{ collectionName: CN }>(query);
  }

  async insert<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    object: WriteModel<M, CN>
  ): Promise<ReadModel<M, CN>> {
    // we need to convert Sets to arrays before sending to the server
    const schema = await this.schema();
    const collectionSchema = schema?.[collectionName].schema;

    // TODO: we should just be able to use the internal changeset here, which is
    // already JSON compliant
    const jsonEntity = collectionSchema
      ? Type.serialize(collectionSchema, object, 'decoded')
      : object;
    const { data, error } = await this.sendRequest('/insert', 'POST', {
      collectionName,
      entity: jsonEntity,
    });
    if (error) throw error;
    return deserializeEntity(collectionSchema, data);
  }

  async bulkInsert(bulk: BulkInsert<M>): Promise<BulkInsertResult<M>> {
    const schema = await this.schema();
    let payload = bulk;
    if (schema) {
      const schemaPayload: BulkInsert<M> = {};
      for (const key in bulk) {
        const collectionName = key as CollectionNameFromModels<M>;
        const data = bulk[collectionName];
        const collectionSchema = schema?.[collectionName].schema;
        if (!data) continue;
        schemaPayload[collectionName] = data.map((entity: any) =>
          serializeEntity(collectionSchema, entity)
        );
      }
      payload = schemaPayload;
    }

    const { data, error } = await this.sendRequest(
      '/bulk-insert-file',
      'POST',
      payload,
      { isFile: true }
    );
    if (error) throw error;
    const result: BulkInsertResult<M> = {};
    for (const key in data) {
      const collectionName = key as CollectionNameFromModels<M>;
      const collectionSchema = schema?.[collectionName].schema;
      result[collectionName] = data[key].map((entity: any) =>
        deserializeEntity(collectionSchema, entity)
      );
    }
    return result;
  }

  async update<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    id: string,
    update: UpdatePayload<M, CN>
  ) {
    let changes = undefined;
    const schema = await this.schema();
    const collectionSchema = schema?.[collectionName]?.schema;
    if (typeof update === 'function') {
      const existingEntity = await this.fetchById(collectionName, id);
      if (!existingEntity) {
        throw new EntityNotFoundError(id, collectionName);
      }
      changes = {};
      // one of the key assumptions we're making here is that the update proxy
      // will take car of the conversion of Sets and Dates. This is mostly
      // to account for capturing changes to Sets because we need something
      // that can track deletes and sets to a Set, which a Set itself cannot do
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
    const { data, error } = await this.sendRequest('/update', 'POST', {
      collectionName,
      entityId: id,
      changes,
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

  async deleteAll<CN extends CollectionNameFromModels<M>>(collectionName: CN) {
    const { data, error } = await this.sendRequest('/delete-all', 'POST', {
      collectionName,
    });
    if (error) throw error;
    return data;
  }

  query<CN extends CollectionNameFromModels<M>>(collectionName: CN) {
    return queryBuilder<M, CN>(collectionName);
  }
}

export type BulkInsert<M extends Models<M> = Models> = {
  [CN in CollectionNameFromModels<M>]?: WriteModel<M, CN>[];
};

export type BulkInsertResult<M extends Models<M> = Models> = {
  [CN in CollectionNameFromModels<M>]?: ReadModel<M, CN>[];
};

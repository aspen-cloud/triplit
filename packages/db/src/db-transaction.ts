import { AttributeItem, EAV, TripleStoreTransaction } from './triple-store';
import {
  getSchemaFromPath,
  ProxyTypeFromModel,
  Model,
  Models,
  objectToTimestampedObject,
  SetProxy,
  AttributeDefinition,
  getDefaultValuesForCollection,
} from './schema';
import * as Document from './document';
import { nanoid } from 'nanoid';
import CollectionQueryBuilder, {
  CollectionQuery,
  doesEntityObjMatchWhere,
  fetch,
  FetchResult,
} from './collection-query';
import { EntityNotFoundError, WriteRuleError } from './errors';
import { ValuePointer } from '@sinclair/typebox/value';
import {
  CollectionNameFromModels,
  CollectionFromModels,
  ModelFromModels,
  CreateCollectionOperation,
  CollectionRules,
  ruleToTuple,
  DropCollectionOperation,
  AddAttributeOperation,
  DropAttributeOperation,
  DBFetchOptions,
  AlterAttributeOptionOperation,
  DropAttributeOptionOperation,
} from './db';
import {
  validateExternalId,
  appendCollectionToId,
  transformTripleAttribute,
  replaceVariablesInQuery,
} from './db-helpers';
import { Query } from './query';
import { toBuilder } from './utils/builder';

export class DBTransaction<M extends Models<any, any> | undefined> {
  constructor(
    readonly storeTx: TripleStoreTransaction,
    readonly variables?: Record<string, any>
  ) {}

  // get schema() {
  //   return this.storeTx.schema?.collections;
  // }
  async getCollectionSchema<CN extends CollectionNameFromModels<M>>(
    collectionName: CN
  ) {
    const { collections } = (await this.getSchema()) ?? {};
    if (!collections) return undefined;
    // TODO: i think we need some stuff in the triple store...
    const collectionSchema = collections[
      collectionName
    ] as CollectionFromModels<M, CN>;
    return {
      ...collectionSchema,
    };
  }

  private addReadRulesToQuery<Q extends CollectionQuery<ModelFromModels<M>>>(
    query: Q,
    collection: CollectionFromModels<M>
  ): Q {
    if (collection?.rules?.read) {
      const updatedWhere = [
        ...query.where,
        ...collection.rules.read.flatMap((rule) => rule.filter),
      ];
      return { ...query, where: updatedWhere };
    }
    return query;
  }

  async getSchema() {
    return this.storeTx.readSchema();
  }

  async commit() {
    await this.storeTx.commit();
  }

  async cancel() {
    await this.storeTx.cancel();
  }

  async insert(
    collectionName: CollectionNameFromModels<M>,
    doc: any,
    id?: string
  ) {
    if (id) {
      const validationError = validateExternalId(id);
      if (validationError) throw validationError;
    }
    const collection = await this.getCollectionSchema(collectionName);
    if (collection) {
      const collectionDefaults = getDefaultValuesForCollection(collection);
      doc = { ...collectionDefaults, ...doc };
    }
    if (collection?.rules?.write?.length) {
      const filters = collection.rules.write.flatMap((r) => r.filter);
      let query = { where: filters } as CollectionQuery<ModelFromModels<M>>;
      query = replaceVariablesInQuery(this, query);
      // TODO there is probably a better way to to this
      // rather than converting to timestamped object check to
      // validate the where filter
      const timestampDoc = objectToTimestampedObject(doc);
      const satisfiedRule = doesEntityObjMatchWhere(
        timestampDoc,
        query.where,
        collection.attributes
      );
      if (!satisfiedRule) {
        // TODO add better error that uses rule description
        throw new WriteRuleError(`Insert does not match write rules`);
      }
    }
    await Document.insert(
      this.storeTx,
      appendCollectionToId(collectionName, id ?? nanoid()),
      doc,
      collectionName
    );
  }

  async update<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entityId: string,
    updater: (
      entity: ProxyTypeFromModel<ModelFromModels<M, CN>>
    ) => Promise<void>
  ) {
    const collection = (await this.getSchema())?.collections[
      collectionName
    ] as CollectionFromModels<M, CN>;

    const entity = await this.fetchById(collectionName, entityId);

    if (!entity) {
      throw new EntityNotFoundError(
        entityId,
        collectionName,
        "Cannot perform an update on an entity that doesn't exist"
      );
    }
    const changes = new Map<string, any>();
    const collectionSchema = collection?.attributes;
    const updateProxy = this.createUpdateProxy<typeof collectionSchema>(
      changes,
      entity,
      collectionSchema
    );
    await updater(updateProxy);
    const fullEntityId = appendCollectionToId(collectionName, entityId);
    for (let [path, value] of changes) {
      value = value instanceof Date ? value.toISOString() : value;
      await this.storeTx.setValue(
        fullEntityId,
        [collectionName, ...path.slice(1).split('/')],
        value
      );
    }
    if (collection?.rules?.write?.length) {
      const updatedEntity = await this.fetchById(collectionName, entityId);
      const filters = collection.rules.write.flatMap((r) => r.filter);
      let query = { where: filters } as CollectionQuery<ModelFromModels<M>>;
      query = replaceVariablesInQuery(this, query);
      const satisfiedRule = doesEntityObjMatchWhere(
        objectToTimestampedObject(updatedEntity),
        query.where,
        collectionSchema
      );
      if (!satisfiedRule) {
        // TODO add better error that uses rule description
        throw new WriteRuleError(`Update does not match write rules`);
      }
    }
  }

  private createUpdateProxy<M extends Model<any> | undefined>(
    changeTracker: Map<string, any>,
    entityObj: ProxyTypeFromModel<M>,
    schema?: M,
    prefix: string = ''
  ): ProxyTypeFromModel<M> {
    return new Proxy(entityObj, {
      set: (_target, prop, value) => {
        const propPointer = [prefix, prop].join('/');
        if (!schema) {
          changeTracker.set(propPointer, value);
          return true;
        }
        const propSchema = getSchemaFromPath(
          schema,
          propPointer.slice(1).split('/')
        );
        if (!propSchema) {
          // TODO use correct Triplit Error
          throw new Error(
            `Cannot set unrecognized property ${propPointer} to ${value}`
          );
        }
        changeTracker.set(propPointer, value);
        return true;
      },
      get: (_target, prop) => {
        const propPointer = [prefix, prop].join('/');
        const propValue = ValuePointer.Get(entityObj, propPointer);
        if (propValue === undefined) return changeTracker.get(propPointer);
        const propSchema =
          schema && getSchemaFromPath(schema, propPointer.slice(1).split('/'));
        if (
          typeof propValue === 'object' &&
          (!propSchema || propSchema['x-crdt-type'] !== 'Set') &&
          propValue !== null
        ) {
          return this.createUpdateProxy(
            changeTracker,
            entityObj,
            schema,
            propPointer
          );
        }
        if (propSchema) {
          if (propSchema['x-crdt-type'] === 'Set') {
            return {
              add: (value: any) => {
                changeTracker.set([propPointer, value].join('/'), true);
              },
              remove: (value: any) => {
                changeTracker.set([propPointer, value].join('/'), false);
              },
              has: (value: any) => {
                const valuePointer = [propPointer, value].join('/');
                return changeTracker.has(valuePointer)
                  ? changeTracker.get(valuePointer)
                  : propValue[value];
              },
            } as SetProxy<any>;
          }
        }
        return changeTracker.has(propPointer)
          ? changeTracker.get(propPointer)
          : propValue;
      },
    });
  }

  async fetch<Q extends CollectionQuery<ModelFromModels<M>>>(
    query: Q,
    { skipRules = false }: DBFetchOptions = {}
  ): Promise<FetchResult<Q>> {
    let fetchQuery = query;
    const collection = await this.getCollectionSchema(
      fetchQuery.collectionName as CollectionNameFromModels<M>
    );
    if (collection && !skipRules) {
      fetchQuery = this.addReadRulesToQuery(fetchQuery, collection);
    }
    fetchQuery = replaceVariablesInQuery(this, fetchQuery);
    return fetch(this.storeTx, fetchQuery, {
      schema: collection?.attributes,
      includeTriples: false,
    });
  }

  // maybe make it public? Keeping private bc its only used internally
  private query<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    params?: Query<ModelFromModels<M, CN>>
  ): toBuilder<CollectionQuery<ModelFromModels<M, CN>>> {
    // TODO: When fixing the type here, ensure the built output looks correct (had to manually assign this to work in the past)
    return CollectionQueryBuilder(collectionName as string, params);
  }

  async fetchById<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    id: string,
    { skipRules = false }: DBFetchOptions = {}
  ) {
    const query = this.query(collectionName).entityId(id).build();
    const result = await this.fetch(query, { skipRules });
    return result.has(id) ? result.get(id) : null;
  }

  async createCollection(params: CreateCollectionOperation[1]) {
    const { name: collectionName, attributes, rules } = params;
    const attributeTuples = Object.entries(attributes).flatMap<EAV>(
      ([path, attribute]) =>
        attributeToTuples(attribute, [
          'collections',
          collectionName,
          'attributes',
          path,
        ]).map((av) => ['_schema', ...av] as EAV)
    );
    const ruleTuples = !rules
      ? []
      : (['read', 'write', 'update'] as (keyof CollectionRules<any>)[]).flatMap(
          (ruleType) =>
            rules[ruleType] != undefined
              ? rules[ruleType]!.flatMap((rule, i) =>
                  ruleToTuple(collectionName, ruleType, i, rule)
                )
              : []
        );
    await this.storeTx.updateMetadataTuples([
      ...attributeTuples,
      ...ruleTuples,
    ]);
  }

  async dropCollection(params: DropCollectionOperation[1]) {
    const { name: collectionName } = params;
    // DELETE SCHEMA INFO
    const existingAttributeInfo = await this.storeTx.readMetadataTuples(
      '_schema',
      ['collections', collectionName]
    );
    const deletes = existingAttributeInfo.map<[string, AttributeItem[]]>(
      (eav) => [eav[0], eav[1]]
    );
    await this.storeTx.deleteMetadataTuples(deletes);
  }

  async addAttribute(params: AddAttributeOperation[1]) {
    const { collection: collectionName, path, attribute } = params;
    // Update schema if there is schema
    if (await this.getSchema()) {
      const fullPath = interleaveValue(path, 'properties');
      const updates = attributeToTuples(attribute, [
        'collections',
        collectionName,
        'attributes',
        ...fullPath,
      ]).map((av) => ['_schema', ...av] as EAV);
      await this.storeTx.updateMetadataTuples(updates);
    }
  }

  async dropAttribute(params: DropAttributeOperation[1]) {
    const { collection: collectionName, path } = params;
    // Update schema if there is schema
    if (await this.getSchema()) {
      const fullPath = interleaveValue(path, 'properties');
      const existingAttributeInfo = await this.storeTx.readMetadataTuples(
        '_schema',
        ['collections', collectionName, 'attributes', ...fullPath]
      );
      // Delete old attribute tuples
      const deletes = existingAttributeInfo.map<[string, AttributeItem[]]>(
        (eav) => [eav[0], eav[1]]
      );
      await this.storeTx.deleteMetadataTuples(deletes);
    }
  }

  async alterAttributeOption(params: AlterAttributeOptionOperation[1]) {
    const { collection: collectionName, path, ...options } = params;
    // Update schema if there is schema
    if (await this.getSchema()) {
      const deletes: [string, AttributeItem[]][] = [];
      const updates: EAV[] = [];
      for (const key of Object.keys(options)) {
        const fullPath = interleaveValue(path, 'properties');
        deletes.push([
          '_schema',
          [
            'collections',
            collectionName,
            'attributes',
            ...fullPath,
            'options',
            key,
          ],
        ]);
      }
      for (const [key, value] of Object.entries(options)) {
        const fullPath = interleaveValue(path, 'properties');
        updates.push([
          '_schema',
          [
            'collections',
            collectionName,
            'attributes',
            ...fullPath,
            'options',
            key,
          ],
          // @ts-ignore (storing a serializable object here (ex default func), but not technically a valid Value)
          value,
        ]);
      }
      await this.storeTx.deleteMetadataTuples(deletes);
      await this.storeTx.updateMetadataTuples(updates);
    }
  }

  async dropAttributeOption(params: DropAttributeOptionOperation[1]) {
    const { collection: collectionName, path, option } = params;
    // Update schema if there is schema
    if (await this.getSchema()) {
      const deletes: [string, AttributeItem[]][] = [];
      const fullPath = interleaveValue(path, 'properties');
      deletes.push([
        '_schema',
        [
          'collections',
          collectionName,
          'attributes',
          ...fullPath,
          'options',
          option,
        ],
      ]);
      await this.storeTx.deleteMetadataTuples(deletes);
    }
  }
}

function interleaveValue<T, U>(arr: T[], value: U): (T | U)[] {
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    result.push(arr[i]);
    if (i !== arr.length - 1) {
      result.push(value);
    }
  }
  return result;
}

function attributeToTuples(
  attribute: AttributeDefinition,
  prefix: string[] = []
): [string[], any][] {
  // return objectToTuples(json) as EAV[];
  // check known types
  if (attribute.type === 'record') {
    return [
      [[...prefix, 'type'], 'record'],
      ...Object.entries(attribute.properties).flatMap(([key, value]) =>
        attributeToTuples(value, [...prefix, 'properties', key])
      ),
    ];
  }
  return [
    [[...prefix, 'type'], attribute.type],
    ...Object.entries(attribute.options ?? {}).map(
      ([key, value]) => [[...prefix, 'options', key], value] as [string[], any]
    ),
  ];
}

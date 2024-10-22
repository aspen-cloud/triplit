import { ValuePointer } from '@sinclair/typebox/value';
import { timestampCompare } from './timestamp.js';
import { Attribute, TripleRow } from './triple-store-utils.js';
import { splitIdParts } from './db-helpers.js';
import { compareTuple } from '@triplit/tuple-database';
import { InvalidTripleApplicationError } from './errors.js';
import { attributeToJsonPointer } from './utils.js';
import { Model, Models } from './schema/types/index.js';
import { RecordType } from './data-types/definitions/record.js';

export const COLLECTION_MARKER = '_collection';
export const COLLECTION_ATTRIBUTE = [COLLECTION_MARKER];
export const OBJECT_MARKER = '{}';

/**
 * Applies a set of triples to an entity. Returns true if any triples were applied.
 */
export function updateEntity(entity: Entity, triples: TripleRow[]) {
  return triples.reduce((hasChanges, triple) => {
    return entity.applyTriple(triple) || hasChanges;
  }, false);
}

/**
 * Constructs an entity from a set of triples. Returns undefined if the entity does not exist in the triples.
 */
export function constructEntity(
  triples: TripleRow[],
  id: string,
  schema?: Models
) {
  const entities = constructEntities(triples, schema);
  return entities.get(id);
}

/**
 * Converts a set of triples into a map of entities.
 */
export function constructEntities(
  triples: TripleRow[],
  schema?: Models,
  maxTimestamps?: Map<string, number>,
  treatMissingClientIdAs: 'higher' | 'lower' = 'lower'
) {
  return triples.reduce((acc, triple) => {
    const { id, timestamp } = triple;
    // Limits triple application to a point in time
    if (maxTimestamps) {
      const [_clock, client] = timestamp;
      // if timestamp is greater, return early and dont apply triple
      if (!maxTimestamps.has(client) && treatMissingClientIdAs === 'lower')
        return acc;

      const stateVectorEntry = maxTimestamps.get(client)!;
      if (
        stateVectorEntry &&
        timestampCompare(timestamp, [stateVectorEntry, client]) > 0
      ) {
        return acc;
      }
    }

    let entity;
    if (acc.has(id)) {
      entity = acc.get(id)!;
    } else {
      const collectionName = splitIdParts(id)[0];
      const model = schema?.[collectionName]?.schema;
      entity = new Entity([], model);
      acc.set(id, entity);
    }
    entity.applyTriple(triple);
    return acc;
  }, new Map<string, Entity>());
}

export function isCollectionAttribute(attribute: Attribute) {
  return attribute.length === 1 && attribute[0] === COLLECTION_MARKER;
}

export class Entity {
  // private writable state
  private _id: string | undefined;
  private _collectionName: string | undefined;
  private _isDeleted: boolean = false;
  private _data: Record<string, any> | undefined;
  private _model: Model | undefined;

  /**
   * The ordered (by attribute) set of triples that make up this entity. This will only include the latest triple for each attribute.
   *
   * This should not be modified directly. Use `applyTriple` to add triples to the entity.
   */
  readonly triples: TripleRow[] = [];

  // Marker to indicate that the entity data should be materialized on read
  private shouldMaterialize = false;

  constructor(triples: TripleRow[] = [], model?: Model) {
    this._model = model;
    for (const triple of triples) {
      this.applyTriple(triple);
    }
  }

  /**
   * The id of the entity in the format {collection}#{id}
   *
   * If no triples have been applied, this will be undefined
   */
  get id() {
    return this._id;
  }

  /**
   * The collection name of the entity
   *
   * If no triples have been applied, this will be undefined
   */
  get collectionName() {
    return this._collectionName;
  }

  /**
   * Whether the entity has been deleted
   *
   * If no triples have been applied, this will be false
   */
  get isDeleted() {
    return this._isDeleted;
  }

  /**
   * The materialized data of the entity based on the triples that have been applied.
   *
   * If no triples have been applied, this will be an empty object.
   * If the entity is deleted ???
   */
  get data() {
    if (!this._data || this.shouldMaterialize) {
      this._data = this.materialize();
      this.shouldMaterialize = false;
    }
    return this._data;
  }

  /**
   * Clone an entity. This will create a new entity with the same triples and data as the original entity.
   * It will skip the apply triples step, as we assume the triples are already applied and sorted
   */
  static clone(entity: Entity): Entity {
    const clone = new Entity([], entity._model);
    clone.triples.push(...entity.triples);
    clone._id = entity._id;
    clone._collectionName = entity._collectionName;
    clone._isDeleted = entity._isDeleted;
    clone._data = entity._data;
    clone.shouldMaterialize = entity.shouldMaterialize;
    return clone;
  }

  /**
   * Apply a triple to the entity. This will insert the triple into the correct location in the entity's triples.
   *
   * The first call to this method will set the entity's id and collection name.
   *
   * If the triple is a deletion of the entity, the entity will be marked as deleted.
   *
   * Returns a boolean indicating whether the triple was applied. NOTE: there are cases where applying a triple does not change the materialized data.
   */
  applyTriple(triple: TripleRow): boolean {
    // If first triple we've seen, set id and collection name
    const isFirst = this.triples.length === 0;
    if (isFirst) {
      this._id = triple.id;
      this._collectionName = splitIdParts(triple.id)[0];
    }

    // Check that the triple is for this entity
    if (triple.id !== this._id) {
      throw new InvalidTripleApplicationError(
        'Triple id does not match entity id'
      );
    }

    // Find triple with attribute
    const [index, replace] = this.findTripleIndex(triple.attribute);

    // Add the triple to the entity
    if (replace) {
      // Dont replace if timestamp is older
      // Ties should be applied
      if (
        timestampCompare(triple.timestamp, this.triples[index].timestamp) < 0
      ) {
        return false;
      }
      this.triples[index] = triple;
    } else {
      this.triples.splice(index, 0, triple);
    }

    // If the triple is a deletion of the entity, mark the entity as deleted
    if (isCollectionAttribute(triple.attribute)) {
      this._isDeleted = triple.expired;
    }

    // Mark that the entity should be materialized
    this.shouldMaterialize = true;
    return true;
  }

  /**
   * Find the triple with the given attribute if exists
   */
  findTriple(attr: string | Attribute): TripleRow | undefined {
    if (Array.isArray(attr)) {
      attr = attr.join('/');
    }
    const [index, exists] = this.findTripleIndex(attr);
    return exists ? this.triples[index] : undefined;
  }

  /**
   * Binary search for the index of the triple with the given attribute, and if an entry for that attribute already exists.
   */
  findTripleIndex(attr: string | Attribute): [index: number, exists: boolean] {
    if (Array.isArray(attr)) {
      attr = attr.join('/');
    }
    let low = 0;
    let high = this.triples.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const midAttr = this.triples[mid].attribute.join('/');
      if (midAttr === attr) return [mid, true];
      if (midAttr < attr) low = mid + 1;
      else high = mid - 1;
    }
    return [low, false];
  }

  /**
   * Returns the materialized data of the entity based on the triples that have been applied.
   *
   * This will look for object markers to determine if data should be nested. You MUST have a direct parent object marker for child triples to be read.
   *  ['collection', 'a', 'b'] '{}' -> object marker (current parent)
   *  ['collection', 'a', 'b', 'c', 'd'] 1 ->  child of current parent, but not a direct child...will not be applied
   *  ['collection', 'a', 'b', 'foo'] 2 -> direct child, will be applied
   *  ['collection, 'a', 'bar'] 3 -> we will pop and apply (unless invalid)
   *
   *  Result: { a: { b: { foo: 2 }, bar: 3 } }
   *
   * Deleted entities and entities with no triples will return an empty object.
   */
  private materialize() {
    // NOTE: I feel like deleted entities should have data = undefined, but it breaks some types / need to code around that
    if (this.isDeleted) return {};
    const data = createEntityTemplate(this._model);
    let parentObjectStack: TripleRow[] = [];
    for (const triple of this.triples) {
      let { attribute, value, expired } = triple;
      // Skip _collection attribute
      if (isCollectionAttribute(attribute)) continue;

      // Pull out materialized object path
      const [_collection, ...dataPath] = attribute;
      const isObjMarker = value === OBJECT_MARKER && !expired;

      // Parse expected materialized value
      value = parseTripleValue(triple);

      // Track current parent (may be undefined)
      let parentObjMarker = parentObjectStack.at(-1);

      // Check if attribute is a child of the current parent, if not pop until we find parent
      while (parentObjectStack.length > 0) {
        if (isChildOf(triple, parentObjMarker)) break;
        parentObjectStack.pop();
        parentObjMarker = parentObjectStack.at(-1);
      }

      /**
       * Once we have a parent match, we can apply the value if:
       * 1. The triple is a DIRECT child of parent (meaning there must be an object marker present for nested values)
       * 2. The triple timestamp is gte the parent object marker timestamp (this handles object assignments)
       */
      if (
        isChildOf(triple, parentObjMarker, 1) &&
        (parentObjMarker
          ? timestampCompare(triple.timestamp, parentObjMarker.timestamp) >= 0
          : true)
      ) {
        applyValue(data, dataPath, value);
        if (isObjMarker) {
          parentObjectStack.push(triple);
        }
      }
    }

    return data;
  }
}

/**
 * Compares two triples to determine if the first is a child of the second.
 *
 * A triple is a child of a parent if the parent's attribute is a prefix of the child's attribute and the parent's timestamp is less than or equal to the child's timestamp.
 *
 * If the generations parameter is provided, the child must be exactly that many generations younger than the parent.
 */
function isChildOf(
  child: TripleRow,
  parent: TripleRow | undefined,
  generations?: number
) {
  // If no parent, child must be a root attribute
  if (!parent)
    return (
      isCollectionAttribute(child.attribute) || child.attribute.length === 2
    );
  const generationsBack =
    generations ?? child.attribute.length - parent.attribute.length;
  if (generationsBack < 0) return false;
  return (
    parent.attribute.length === child.attribute.length - generationsBack &&
    compareTuple(
      parent.attribute,
      child.attribute.slice(0, -generationsBack)
    ) === 0
  );
}

function parseTripleValue(triple: TripleRow): any {
  if (triple.value === OBJECT_MARKER) return {};
  if (triple.expired) return undefined;
  return triple.value;
}

function applyValue(
  data: Record<string, any>,
  path: string | Attribute,
  value: any
) {
  path = Array.isArray(path) ? attributeToJsonPointer(path) : path;
  if (value === undefined) {
    ValuePointer.Delete(data, path);
  } else {
    ValuePointer.Set(data, path, value);
  }
}

function createEntityTemplate(model: Model | undefined) {
  if (!model) return {};
  return new EntityTemplate(model);
}

/**
 * A template for an entity's data based on a model.
 *
 * Attempts to avoid V8 hidden classes https://v8.dev/docs/hidden-classes
 */
class EntityTemplate<T extends RecordType> {
  constructor(model: T) {
    for (const [key, property] of Object.entries(model.properties)) {
      if (property.type === 'query') continue;
      if (property.type === 'record') {
        (this as any)[key] = new EntityTemplate(property as RecordType);
      }
      (this as any)[key] = undefined;
    }
  }
}

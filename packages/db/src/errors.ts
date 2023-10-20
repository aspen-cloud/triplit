import {
  COLLECTION_TYPE_KEYS,
  VALUE_TYPE_KEYS,
} from './data-types/serialization.js';

export const STATUS_CODES = {
  Success: 200,

  'Bad Request': 400,
  Unauthorized: 401,
  'Payment Required': 402,
  Forbidden: 403,
  'Not Found': 404,
  Conflict: 409,
  'Too Many Requests': 429,

  'Internal Server Error': 500,
  'Service Unavailable': 503,
  'Gateway Timeout': 504,
};

export class TriplitError extends Error {
  status: number = STATUS_CODES['Internal Server Error'];
  contextMessage?: string;

  constructor(contextMessage?: string, ...args: any[]) {
    super(...args);
    this.name = 'TriplitError';
    this.message = args[0] || 'Triplit Error';
    this.contextMessage = contextMessage;
  }

  toString() {
    return JSON.stringify(this.toJSON());
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      contextMessage: this.contextMessage,
    };
  }
}

// DB Errors
export class InvalidInternalEntityIdError extends TriplitError {
  constructor(entityId: string, ...args: any[]) {
    super(...args);
    this.name = 'InvalidInternalEntityIdError';
    this.message = `${entityId} is not a valid internal entity id.`;
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

export class DBScanFailureError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'DBScanFailureError';
    this.message = `DB scan failed.`;
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

export class InvalidTimestampIndexScanError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'InvalidTimestampIndexScanError';
    this.message = `The scan over the timestamp index you are attempting is invalid.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class IndexNotFoundError extends TriplitError {
  constructor(indexName: string, ...args: any[]) {
    super(...args);
    this.name = 'IndexNotFoundError';
    this.message = `${indexName} is not a valid index.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class EntityNotFoundError extends TriplitError {
  constructor(entityId: string, collectionName: string, ...args: any[]) {
    super(...args);
    this.name = 'EntityNotFoundError';
    this.message = `Could not find entity with id ${entityId} in collection ${collectionName}.`;
    this.status = STATUS_CODES['Not Found'];
  }
}

// Query Errors
export class InvalidFilterError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'InvalidFilterError';
    this.message = `Your query passed a filter that is invalid.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class SessionVariableNotFoundError extends TriplitError {
  constructor(variableName: string, ...args: any[]) {
    super(...args);
    this.name = 'SessionVariableNotFoundError';
    this.message = `${variableName} could not be found in the provided variables for this query.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class EntityIdMissingError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'EntityIdMissingError';
    this.message = `The query engine expected an entity id to be present on a query but found none. Please ensure that the entity id provided to the query is defined.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

// Mutation Errors
export class InvalidMutationError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'InvalidMutationError';
    this.message = `You are attempting a mutation that is invalid.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

// Schema Errors
export class ValueSchemaMismatchError extends TriplitError {
  constructor(model: string, attribute: string[], value: any, ...args: any[]) {
    super(...args);
    this.name = 'ValueSchemaMismatchError';
    this.message = `Cannot assign ${value} to '${attribute.join(
      '.'
    )}' because it does not match the schema for ${model}.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class NoSchemaRegisteredError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'NoSchemaRegisteredError';
    this.message = 'No schema was availabe when one was expected to be.';
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

export class ModelNotFoundError extends TriplitError {
  constructor(modelName: string, existingKeys: string[], ...args: any[]) {
    super(...args);
    this.name = 'ModelNotFoundError';
    this.message = `Could not find a model with name ${modelName} in your schema. Valid collections are: [${existingKeys
      .map((k) => `'${k}'`)
      .join(', ')}].`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidEntityIdError extends TriplitError {
  constructor(entityId: string, ...args: any[]) {
    super(...args);
    this.name = 'InvalidEntityIdError';
    this.message = `${entityId} is not a valid entity id.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidTypeError extends TriplitError {
  constructor(type: string, ...args: any[]) {
    super(...args);
    this.name = 'InvalidTypeError';
    this.message = `Could not properly construct the type ${type} with the information you provided.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidSetTypeError extends TriplitError {
  constructor(type: string, ...args: any[]) {
    super(...args);
    this.name = 'InvalidSetTypeError';
    this.message = `When constructing the schema, an invalid type for the items in a set was recieved. A set may only be of type ${COLLECTION_TYPE_KEYS}. You passed '${type}'.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidSchemaType extends TriplitError {
  constructor(type: string, ...args: any[]) {
    super(...args);
    this.name = 'InvalidSchemaType';
    this.message = `The type '${type}' is not a valid type for a Triplit schema.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class SchemaPathDoesNotExistError extends TriplitError {
  constructor(path: string[], ...args: any[]) {
    super(...args);
    this.name = 'SchemaPathDoesNotExistError';
    this.message = `The path '${path.join('.')}' does not exist in the schema.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidSchemaPathError extends TriplitError {
  constructor(path: string[], ...args: any[]) {
    super(...args);
    this.name = 'InvalidSchemaPathError';
    this.message = `The path '${path.join(
      '.'
    )}' is not a valid path in the schema.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidTypeOptionsError extends TriplitError {
  constructor(defaultObj: any, ...args: any[]) {
    super(...args);
    this.name = 'InvalidTypeOptionsError';
    // TODO: pass in more info about the specific attribute and schema mismatches
    this.message = `Received ${JSON.stringify(defaultObj)}`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

// Migration Errors
export class InvalidMigrationOperationError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'InvalidMigrationOperationError';
    this.message = `Invalid migration operation.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class WriteRuleError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'RuleError';
    this.message = `Write failed because it didn't pass a Rule.`;
    this.status = STATUS_CODES.Unauthorized;
  }
}

export class UnrecognizedPropertyInUpdateError extends TriplitError {
  constructor(propPointer: string, value: any, ...args: any[]) {
    super(...args);
    this.name = 'UnrecognizedPropertyInUpdateError';
    this.message = `Cannot set unrecognized property ${propPointer} to ${String(
      value
    )} during an entity update. The property may not be defined in your schema.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

// TODO: this one is weird, feels like we shouldn't get here
export class MissingAttributeDefinitionError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'MissingAttributeDefinitionError';
    this.message =
      'An attribute definition is missing from your schema. Please check that your schema has properly formed attribute definitions for each attribute.';
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

export class UnrecognizedAttributeTypeError extends TriplitError {
  constructor(type: string, ...args: any[]) {
    super(...args);
    this.name = 'UnrecognizedAttributeTypeError';
    this.message = `An attribute in the schema contains an unsupported type: ${type}. Valid types are ${[
      VALUE_TYPE_KEYS,
      ...COLLECTION_TYPE_KEYS,
      'query',
    ]}`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class EditingProtectedFieldError extends TriplitError {
  constructor(field: string, ...args: any[]) {
    super(...args);
    this.name = 'EditingProtectedFieldError';
    this.message = `Cannot edit protected field: ${field}`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidTripleStoreValueError extends TriplitError {
  constructor(value: any, ...args: any[]) {
    super(...args);
    this.name = 'InvalidTripleStoreValueError';
    this.message = `Cannot store value ${String(value)} in the triple store.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class QueryCacheError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'QueryCacheError';
    this.message = 'An error ocurred inside the query cache';
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class UnserializableValueError extends TriplitError {
  constructor(value: any, ...args: any[]) {
    super(...args);
    this.name = 'UnserializableValueError';
    this.message = `Cannot serialize value ${String(
      value
    )} for insertion into the database.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class TripleStoreOptionsError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'TripleStoreOptionsError';
    this.message = `There was an error in the configuration of the triple store.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class QueryClauseFormattingError extends TriplitError {
  constructor(
    clauseType: 'order' | 'where' | 'select' | 'syncStatus',
    clause: any,
    ...args: any[]
  ) {
    super(...args);
    this.name = 'QueryClauseFormattingError';
    this.message = `The ${clauseType} clause is not formatted correctly.
    
    Received: ${JSON.stringify(clause)}`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class EmptyTupleInsertionError extends TriplitError {
  constructor(
    id: string,
    document: Record<string, any>,
    collectionName?: string,
    ...args: any[]
  ) {
    super(...args);
    this.name = 'EmptyTupleInsertionError';
    this.message = `Insertion of the document ${JSON.stringify(
      document
    )} with the id ${id}${
      collectionName ? ' in the collection ' + collectionName : ''
    } failed because it generated an empty tuple.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class DBOptionsError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'DBOptionsError';
    this.message = `There was an error in the configuration of the Triplit database.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class SerializingError extends TriplitError {
  constructor(targetType: string, erroneousValue: any, ...args: any[]) {
    super(...args);
    this.name = 'SerializingError';
    this.message = `When inserting or updating an entity, there was an error serializing the data: ${erroneousValue} as type: ${targetType}`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidSchemaOptionsError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'InvalidAttributeOptionsError';
    this.message = `The options for an attribute in the schema are invalid.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class NotImplementedError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'NotImplementedError';
    this.message = `This feature is not yet implemented.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

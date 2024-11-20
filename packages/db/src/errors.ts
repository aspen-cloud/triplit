import {
  COLLECTION_TYPE_KEYS,
  VALUE_TYPE_KEYS,
} from './data-types/constants.js';
import { SessionRole } from './schema/permissions.js';
import { Models } from './schema/types/index.js';
import { ITriplitError } from '@triplit/types/errors.js';

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
  baseMessage: string;
  contextMessage?: string;

  // Fallback property for checking if an error is a TriplitError
  readonly __isTriplitError = true;

  constructor(contextMessage?: string, ...args: any[]) {
    super(...args);
    this.name = 'TriplitError';
    this.baseMessage = args[0] || 'Triplit Error';
    this.contextMessage = contextMessage;
  }

  get message(): string {
    if (this.contextMessage)
      return `${this.baseMessage} | Context: ${this.contextMessage}`;
    return this.baseMessage;
  }

  toString() {
    return JSON.stringify(this.toJSON());
  }

  toJSON(): ITriplitError {
    return {
      name: this.name,
      message: this.message,
      baseMessage: this.baseMessage,
      status: this.status,
      contextMessage: this.contextMessage,
    };
  }
  static fromJson(json: any) {
    const error = new TriplitError(json.contextMessage);
    if (json.baseMessage) error.baseMessage = json.baseMessage;
    if (json.name) error.name = json.name;
    if (json.status) error.status = json.status;
    return error;
  }
}

// DB Errors
export class InvalidCollectionNameError extends TriplitError {
  constructor(collectionName: string, ...args: any[]) {
    super(...args);
    this.name = 'InvalidCollectionNameError';
    this.baseMessage = `${collectionName} is not a valid collection name.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidInsertDocumentError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'InvalidInsertDocumentError';
    this.baseMessage = `The document you are attempting to insert is invalid.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidInternalEntityIdError extends TriplitError {
  constructor(entityId: string, ...args: any[]) {
    super(...args);
    this.name = 'InvalidInternalEntityIdError';
    this.baseMessage = `${entityId} is not a valid internal entity id.`;
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

export class DBScanFailureError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'DBScanFailureError';
    this.baseMessage = `DB scan failed.`;
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

export class InvalidTimestampIndexScanError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'InvalidTimestampIndexScanError';
    this.baseMessage = `The scan over the timestamp index you are attempting is invalid.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class IndexNotFoundError extends TriplitError {
  constructor(indexName: string, ...args: any[]) {
    super(...args);
    this.name = 'IndexNotFoundError';
    this.baseMessage = `${indexName} is not a valid index.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class EntityNotFoundError extends TriplitError {
  constructor(entityId: string, collectionName: string, ...args: any[]) {
    super(...args);
    this.name = 'EntityNotFoundError';
    this.baseMessage = `Could not find entity with id ${entityId} in collection ${collectionName}.`;
    this.status = STATUS_CODES['Not Found'];
  }
}

// Query Errors
export class InvalidFilterError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'InvalidFilterError';
    this.baseMessage = `Your query passed a filter that is invalid.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class SessionVariableNotFoundError extends TriplitError {
  constructor(
    variableName: string,
    scope: string,
    allVars: Record<string, any>,
    ...args: any[]
  ) {
    super(...args);
    this.name = 'SessionVariableNotFoundError';
    this.baseMessage = `\'${variableName}\' could not be found in the variables for this query. The available $${scope} variables are: ${Object.keys(
      allVars
    )
      .map((v) => `\'$${scope}.${v}\'`)
      .join(', ')}`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class EntityIdMissingError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'EntityIdMissingError';
    this.baseMessage = `The query engine expected an entity id to be present on a query but found none. Please ensure that the entity id provided to the query is defined.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

// Mutation Errors
export class InvalidAssignmentError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'InvalidAssignmentError';
    this.baseMessage = `You are attempting to assign a value that is not valid for the attribute you are assigning to.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidOperationError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'InvalidOperationError';
    this.baseMessage = `You are attempting to perform an operation that is not valid.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

// Schema Errors
export class ValueSchemaMismatchError extends TriplitError {
  constructor(model: string, attribute: string[], value: any, ...args: any[]) {
    super(...args);
    this.name = 'ValueSchemaMismatchError';
    this.baseMessage = `Cannot assign ${value} to '${attribute.join(
      '.'
    )}' because it does not match the schema for ${model}.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class NoSchemaRegisteredError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'NoSchemaRegisteredError';
    this.baseMessage = 'No schema was availabe when one was expected to be.';
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

export class CollectionNotFoundError extends TriplitError {
  constructor(collectionName: string, collections: Models, ...args: any[]) {
    super(...args);
    this.name = 'CollectionNotFoundError';
    this.baseMessage = `Could not find a collection with name ${collectionName} in your schema. Valid collections are: [${Object.keys(
      collections
    )
      .map((k) => `'${k}'`)
      .join(', ')}].`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidEntityIdError extends TriplitError {
  constructor(entityId: string, ...args: any[]) {
    super(...args);
    this.name = 'InvalidEntityIdError';
    this.baseMessage = `${entityId} is not a valid entity id.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidTypeError extends TriplitError {
  constructor(type: string, ...args: any[]) {
    super(...args);
    this.name = 'InvalidTypeError';
    this.baseMessage = `Could not properly construct the type ${type} with the information you provided.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidSetTypeError extends TriplitError {
  constructor(type: string, ...args: any[]) {
    super(...args);
    this.name = 'InvalidSetTypeError';
    this.baseMessage = `When constructing the schema, an invalid type for the items in a set was recieved. A set may only be of type ${COLLECTION_TYPE_KEYS}. You passed '${type}'.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidSchemaType extends TriplitError {
  constructor(type: string, ...args: any[]) {
    super(...args);
    this.name = 'InvalidSchemaType';
    this.baseMessage = `The type '${type}' is not a valid type for a Triplit schema.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidSchemaPathError extends TriplitError {
  constructor(path: string[], ...args: any[]) {
    super(...args);
    this.name = 'InvalidSchemaPathError';
    this.baseMessage = `The path '${path.join(
      '.'
    )}' is not a valid path in the schema.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class RelationDoesNotExistError extends TriplitError {
  constructor(
    relationName: string,
    alias: string,
    collectionName: string,
    ...args: any[]
  ) {
    super(...args);
    this.name = 'RelationDoesNotExistError';
    this.baseMessage = `Your attempt to load \'${relationName}\' at alias \'${alias}\' failed because \'${relationName}\' does not exist in the schema for the collection \'${collectionName}\'.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class IncludedNonRelationError extends TriplitError {
  constructor(
    relationName: string,
    alias: string,
    collectionName: string,
    ...args: any[]
  ) {
    super(...args);
    this.name = 'IncludedNonRelationError';
    this.baseMessage = `Your attempt to load \'${relationName}\' at alias \'${alias}\' failed because \'${relationName}\' in the collection \'${collectionName}\' in not a query type.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidTypeOptionsError extends TriplitError {
  constructor(defaultObj: any, ...args: any[]) {
    super(...args);
    this.name = 'InvalidTypeOptionsError';
    // TODO: pass in more info about the specific attribute and schema mismatches
    this.baseMessage = `Received ${JSON.stringify(defaultObj)}`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

// Permission Errors
export class WriteRuleError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'WriteRuleError';
    this.baseMessage = `Write failed because it didn't pass a Rule.`;
    this.status = STATUS_CODES.Unauthorized;
  }
}

export class WritePermissionError extends TriplitError {
  constructor(
    collection: string,
    entityId: string,
    operation: string,
    sessionRoles: SessionRole[],
    ...args: any[]
  ) {
    super(...args);
    this.name = 'WritePermissionError';
    this.baseMessage = `'${operation}' permission for the collection '${collection}' prevented the ${
      operation === 'insert'
        ? 'insertion'
        : operation === 'delete'
          ? 'deletion'
          : 'update'
    } of the entity with id '${entityId}'. The provided session roles were [${sessionRoles
      .map((m) => m.key)
      .join(', ')}].`;
    this.status = STATUS_CODES.Unauthorized;
  }
}

export class UnrecognizedPropertyInUpdateError extends TriplitError {
  constructor(propPointer: string, value: any, ...args: any[]) {
    super(...args);
    this.name = 'UnrecognizedPropertyInUpdateError';
    this.baseMessage = `Cannot set unrecognized property ${propPointer} to ${String(
      value
    )} during an entity update. The property may not be defined in your schema.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class TypeJSONParseError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'TypeJSONParseError';
    this.baseMessage = 'Failed to parse this type from a JSON form.';
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

export class UnrecognizedAttributeTypeError extends TriplitError {
  constructor(type: string, ...args: any[]) {
    super(...args);
    this.name = 'UnrecognizedAttributeTypeError';
    this.baseMessage = `An attribute in the schema contains an unsupported type: ${type}. Valid types are ${[
      VALUE_TYPE_KEYS,
      ...COLLECTION_TYPE_KEYS,
      'query',
    ]}`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class MalformedSchemaError extends TriplitError {
  constructor(innerError: TriplitError, ...args: any[]) {
    super(...args);
    this.name = 'MalformedSchemaError';
    this.baseMessage = `The schema provided is malformed.`;
    this.contextMessage = `This was triggered by ${innerError.name}: ${innerError.message}`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class EditingProtectedFieldError extends TriplitError {
  constructor(field: string, ...args: any[]) {
    super(...args);
    this.name = 'EditingProtectedFieldError';
    this.baseMessage = `Cannot edit protected field: ${field}`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidTripleStoreValueError extends TriplitError {
  constructor(value: any, ...args: any[]) {
    super(...args);
    this.name = 'InvalidTripleStoreValueError';
    this.baseMessage = `Cannot store value ${String(
      value
    )} in the triple store.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class QueryCacheError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'QueryCacheError';
    this.baseMessage = 'An error ocurred inside the query cache';
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class UnserializableValueError extends TriplitError {
  constructor(value: any, ...args: any[]) {
    super(...args);
    this.name = 'UnserializableValueError';
    this.baseMessage = `Cannot serialize value ${String(
      value
    )} for insertion into the database.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class TripleStoreOptionsError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'TripleStoreOptionsError';
    this.baseMessage = `There was an error in the configuration of the triple store.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class QueryClauseFormattingError extends TriplitError {
  constructor(
    clauseType: 'order' | 'where' | 'select' | 'syncStatus' | 'after',
    clause: any,
    ...args: any[]
  ) {
    super(...args);
    this.name = 'QueryClauseFormattingError';
    this.baseMessage = `The ${clauseType} clause is not formatted correctly.
    
    Received: ${JSON.stringify(clause)}`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class AfterClauseWithNoOrderError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'AfterClauseWithNoOrderError';
    this.baseMessage = `The 'after' clause must be used after an 'order' clause.`;
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
    this.baseMessage = `Insertion of the document ${JSON.stringify(
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
    this.baseMessage = `There was an error in the configuration of the Triplit database.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class DBSerializationError extends TriplitError {
  constructor(targetType: string, erroneousValue: any, ...args: any[]) {
    super(...args);
    this.name = 'DBSerializationError';
    this.baseMessage = `When inserting or updating an entity, there was an error serializing the data: ${erroneousValue} as type: ${targetType}`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidSchemaOptionsError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'InvalidAttributeOptionsError';
    this.baseMessage = `The options for an attribute in the schema are invalid.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class NotImplementedError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'NotImplementedError';
    this.baseMessage = `This feature is not yet implemented.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class JSONValueParseError extends TriplitError {
  constructor(type: string, value: any, ...args: any[]) {
    super(...args);
    this.name = 'JSONValueParseError';
    this.baseMessage = `Failed to parse a ${type} value from the provided JSON input: ${JSON.stringify(
      value
    )}`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class JSToJSONValueParseError extends TriplitError {
  constructor(type: string, value: any, ...args: any[]) {
    super(...args);
    this.name = 'JSToJSONValueParseError';
    this.baseMessage = `Failed to tranform to JSON from the provided ${type} input: ${JSON.stringify(
      value
    )}`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidQueryCardinalityError extends TriplitError {
  constructor(cardinality: string, ...args: any[]) {
    super(...args);
    this.name = 'InvalidQueryCardinalityError';
    this.baseMessage = `The cardinality ${cardinality} is not valid for the query type.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidOrderClauseError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'InvalidOrderClauseError';
    this.baseMessage = `An order clause has been determined to be invalid.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidWhereClauseError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'InvalidWhereClauseError';
    this.baseMessage = `A where clause has been determined to be invalid.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidSelectClauseError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'InvalidSelectClauseError';
    this.baseMessage = `The select clause of this query has been determined to be invalid.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class QueryNotPreparedError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'QueryNotPreparedError';
    this.baseMessage = `The query has parameters that have not been prepared with the schema. This could indicate that the database does not have a schema or that it is not up-to-date. Run \`npx triplit schema diff\` to verify that the server’s schema is in sync with the client’s. If it is not, run \`npx triplit schema push\` to update the server’s schema.`;
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

export class TransactionAlreadyCommittedError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'TransactionAlreadyCommittedError';
    this.baseMessage = `This transaction has already been committed.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class TransactionAlreadyCanceledError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'TransactionAlreadyCanceledError';
    this.baseMessage = `This transaction has already been canceled.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidTransactionStateError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'InvalidTransactionStateError';
    this.baseMessage = `This transaction is in an invalid state. This indicates a bug. Please inform the Triplit team.`;
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

export class InvalidTripleApplicationError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'InvalidTripleApplicationError';
    this.baseMessage = `An invalid triple was applied to an entity.`;
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

import { ITriplitError } from '@triplit/types/errors';
import { ALL_TYPES, SessionRole } from './schema/index.js';
import { QueryResultCardinality } from './types.js';

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

export class InvalidQueryInclusionError extends TriplitError {
  constructor(inclusion: any, ...args: any[]) {
    super(...args);
    this.name = 'InvalidQueryInclusionError';
    this.baseMessage = `An inclusion was provided to a query that is not valid or could not be transformed into a valid inclusion. The inclusion was: ${JSON.stringify(inclusion)}`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidQueryLimitError extends TriplitError {
  constructor(limit: any, ...args: any[]) {
    super(...args);
    this.name = 'InvalidQueryLimitError';
    this.baseMessage = `A limit was provided to a query that is not valid or could not be transformed into a valid limit. The limit was: ${JSON.stringify(limit)}`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidQueryWhereError extends TriplitError {
  constructor(where: any, ...args: any[]) {
    super(...args);
    this.name = 'InvalidQueryWhereError';
    this.baseMessage = `A where clause was provided to a query that is not valid or could not be transformed into a valid where clause. The where clause was: ${JSON.stringify(where)}`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class InvalidQueryAfterError extends TriplitError {
  constructor(after: any, ...args: any[]) {
    super(...args);
    this.name = 'InvalidQueryAfterError';
    this.baseMessage = `An after cursor was provided to a query that is not valid or could not be transformed into a valid after cursor. The after cursor was: ${JSON.stringify(after)}`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class DatabaseNotReadyError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'DatabaseNotReadyError';
    this.baseMessage = 'The database is not ready to accept queries';
    this.status = STATUS_CODES['Service Unavailable'];
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

export class QueryNotPreparedError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'QueryNotPreparedError';
    this.baseMessage = `The query has parameters that have not been prepared with the schema. This could indicate that the database does not have a schema or that it is not up-to-date. Run \`npx triplit schema diff\` to verify that the server’s schema is in sync with the client’s. If it is not, run \`npx triplit schema push\` to update the server’s schema.`;
    this.status = STATUS_CODES['Internal Server Error'];
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

export class InvalidOperationError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'InvalidOperationError';
    this.baseMessage = `You are attempting to perform an operation that is not valid.`;
    this.status = STATUS_CODES['Bad Request'];
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

export class DBSerializationError extends TriplitError {
  constructor(targetType: string, erroneousValue: any, ...args: any[]) {
    super(...args);
    this.name = 'DBSerializationError';
    this.baseMessage = `There was an error serializing an input to an acceptable format. Could not transform the data: ${erroneousValue} as type: ${targetType}`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class DBDeserializationError extends TriplitError {
  constructor(targetType: string, erroneousValue: any, ...args: any[]) {
    super(...args);
    this.name = 'DBDeserializationError';
    this.baseMessage = `There was an error deserializing an database value to JS. Could not tranform the data: ${erroneousValue} as type: ${targetType}`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class JSONSerializationError extends TriplitError {
  constructor(erroneousValue: any, expectedType: string, ...args: any[]) {
    super(...args);
    this.name = 'JSONSerializationError';
    this.baseMessage = `There was an error serializing an input to JSON. Could not tranform the data: ${erroneousValue} as type: ${expectedType}`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class JSONDeserializationError extends TriplitError {
  constructor(erroneousValue: any, expectedType: string, ...args: any[]) {
    super(...args);
    this.name = 'JSONDeserializationError';
    this.baseMessage = `There was an error deserializing a JSON value. Could not tranform the data: ${erroneousValue} as type: ${expectedType}`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class UnrecognizedAttributeTypeError extends TriplitError {
  constructor(type: string, ...args: any[]) {
    super(...args);
    this.name = 'UnrecognizedAttributeTypeError';
    this.baseMessage = `An attribute in the schema contains an unsupported type: ${type}. Valid types are ${[
      ALL_TYPES,
    ]}`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

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
    scopeVars: Record<string, any> | undefined,
    ...args: any[]
  ) {
    super(...args);
    this.name = 'SessionVariableNotFoundError';
    this.baseMessage = `\'${variableName}\' could not be found in the variables for this query. The available ${scope} variables are: ${Object.keys(
      scopeVars ?? {}
    )
      .map((v) => `\'${scope}.${v}\'`)
      .join(', ')}`;
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

export class QueryCacheError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'QueryCacheError';
    this.baseMessage = 'An error occurred inside the query cache';
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

export class InvalidResultCardinalityError extends TriplitError {
  constructor(
    expected: QueryResultCardinality,
    actual: QueryResultCardinality,
    ...args: any[]
  ) {
    super(...args);
    this.name = 'InvalidResultCardinalityError';
    this.baseMessage = `Expected cardinality ${expected} but got ${actual}. This indicates an issue with the query engine. Please report this issue to the Triplit team.`;
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

export class DBInitializationError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'DBInitializationError';
    this.baseMessage = `An error occurred during the initialization of the database.`;
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

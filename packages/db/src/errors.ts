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
    this.message = `A set may only be of type 'string' or 'number'. You passed '${type}'.`;
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

import { STATUS_CODES as HTTP_CODES, TriplitError } from '@triplit/db';
import { Route } from './triplit-server.js';

const STATUS_CODES = {
  ...HTTP_CODES,
  // WebSocket close event codes
  'Service Restart': 1012,

  // Custom ws close event codes
  'No Pong Received': 3000,
  'Client Already Connected': 3001,
};

// Auth errors
export class UnauthorizedError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'UnauthorizedError';
    this.baseMessage = 'Unauthorized';
    this.status = STATUS_CODES['Unauthorized'];
  }
}

export class NoTokenProvidedError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'NoTokenProvidedError';
    this.baseMessage = 'No token provided.';
    this.status = STATUS_CODES['Unauthorized'];
  }
}

export class InvalidAuthenticationSchemeError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'InvalidAuthenticationSchemeError';
    this.baseMessage = 'Must use Bearer authentication scheme.';
    this.status = STATUS_CODES['Unauthorized'];
  }
}

export class InvalidTokenSignatureError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'InvalidTokenSignatureError';
    this.baseMessage =
      'The signature on your token could not be verified successfully.';
    this.status = STATUS_CODES['Unauthorized'];
  }
}

export class InvalidTokenProjectIdError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'InvalidTokenProjectIdError';
    this.baseMessage =
      'The project id on your token does not match the project id for this request.';
    this.status = STATUS_CODES['Unauthorized'];
  }
}

export class TokenMissingProjectIdError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'TokenMissingProjectIdError';
    this.baseMessage = 'The auth token you are using is missing a project id.';
    this.status = STATUS_CODES['Unauthorized'];
  }
}

export class ThirdPartyTokenInfoNotFoundError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'ThirdPartyTokenInfoNotFoundError';
    this.baseMessage =
      'Information for your third party token could not be found. This may be because you have not set an external jwt secret or you are referencing the wrong project. This may also be an issue with Triplit.';
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

export class TokenReadError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'TokenReadError';
    this.baseMessage = 'Error reading token.';
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

export class UnrecognizedTokenTypeError extends TriplitError {
  constructor(type: string, ...args: any[]) {
    super(...args);
    this.name = 'UnrecognizedTokenTypeError';
    this.baseMessage = `The token type ${type} is not recognized.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class ServiceKeyRequiredError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'ServiceKeyRequiredError';
    this.baseMessage = 'Service token required.';
    this.status = STATUS_CODES['Unauthorized'];
  }
}

export class InvalidTokenPayloadError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'InvalidTokenPayloadError';
    this.baseMessage = 'The token payload is invalid.';
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class TokenVerificationError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'TokenVerificationError';
    this.baseMessage = 'Error verifying token.';
    this.status = STATUS_CODES['Unauthorized'];
  }
}

// Messaging errors
export class UnrecognizedMessageTypeError extends TriplitError {
  constructor(type: string, ...args: any[]) {
    super(...args);
    this.name = 'UnrecognizedMessageTypeError';
    this.baseMessage = `Unrecognized message type: ${type}.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class MalformedMessagePayloadError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'MalformedMessagePayloadError';
    this.baseMessage = `Messages payloads must be valid JSON.`;
    this.status = STATUS_CODES['Bad Request'];
  }
}

// Rate limt errors
export class RateLimitExceededError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'RateLimitExceededError';
    this.baseMessage = 'Rate limit exceeded.';
    this.status = STATUS_CODES['Too Many Requests'];
  }
}

// Message specific errors
export class TriplesInsertError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'TriplesInsertError';
    this.baseMessage = 'Triples insert error.';
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

// Maybe split out initial fetch and update errors
export class QuerySyncError extends TriplitError {
  constructor(params: any, ...args: any[]) {
    super(...args);
    this.name = 'QuerySyncError';
    this.baseMessage = `An error occurred while syncing your query: ${JSON.stringify(
      params
    )}`;
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

export class PlatformSetupError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'PlatformSetupError';
    this.baseMessage =
      'There was an error using the services provided by the platform. Please check that the server platform is setup correctly on server initialization.';
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

export class TupleStoreEncodingError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'TupleStoreEncodingError';
    this.baseMessage =
      'The sync server encountered an unknown value type when encoding a tuple.';
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

export class TupleStoreDecodingError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'TupleStoreDecodingError';
    this.baseMessage =
      'The sync server encountered an invalid encoding byte when decoding a tuple.';
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

export class UnserializableObjectError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'UnserializableObjectError';
    this.baseMessage =
      'The sync server encountered an object that could not be serialized.';
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

export class RouteNotFoundError extends TriplitError {
  constructor(route: string[], ...args: any[]) {
    super(...args);
    this.name = 'RouteNotFoundError';
    this.baseMessage = `The server does not have a handler for this request: /${route.join(
      '/'
    )}`;
    this.status = STATUS_CODES['Not Found'];
  }
}

export class UnserializableEntityError extends TriplitError {
  constructor(entity: any, ...args: any[]) {
    super(...args);
    this.name = 'UnserializableObjectError';
    this.baseMessage =
      'The sync server, while schemaless, encountered an object that could not be serialized to JSON.';
    this.contextMessage = `The entity that could not be serialized: ${JSON.stringify(
      entity
    )}`;
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

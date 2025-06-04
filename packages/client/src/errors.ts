import { TriplitError, STATUS_CODES } from '@triplit/db';

export class UnrecognizedFetchPolicyError extends TriplitError {
  constructor(policy: string, ...args: any[]) {
    super(...args);
    this.name = 'UnrecognizedFetchPolicyError';
    this.baseMessage = 'The fetch policy ' + policy + ' is not recognized.';
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class MissingConnectionInformationError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'MissingConnectionInformationError';
    this.baseMessage =
      'Missing connection information. A token and server must be provided.';
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

export class RemoteSyncFailedError extends TriplitError {
  constructor(query: any, ...args: any[]) {
    super(...args);
    this.name = 'RemoteSyncFailedError';
    this.baseMessage =
      'Remote sync failed for query: ' + JSON.stringify(query, null, 2);
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

export class RemoteFetchFailedError extends TriplitError {
  constructor(query: any, ...args: any[]) {
    super(...args);
    this.name = 'RemoteFetchFailedError';
    this.baseMessage =
      'Remote fetch failed for query: ' + JSON.stringify(query, null, 2);
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

export class IndexedDbUnavailableError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'IndexedDbUnavailableError';
    this.baseMessage =
      'IndexedDB is not available in this environment. If you are creating a TriplitClient on the server e.g. prerendering with a SSR framework like Next.js or SvelteKit, you may need to use the `memory` storage provider. Consult our SSR guide (https://triplit.dev/docs/ssr) for more information. If you are running on a non-browser client, like a mobile app, try one of our other storage providers (https://triplit.dev/docs/client/storage).';
    this.status = STATUS_CODES['Service Unavailable'];
  }
}

export class WebSocketsUnavailableError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'WebSocketsUnavailableError';
    this.baseMessage =
      'The TriplitClient syncs over WebSockets, which are not available in this environment. If you are creating a TriplitClient on the server e.g. prerendering with a SSR framework like Next.js or SvelteKit, you should interact with Triplit over HTTP. Consult our SSR guide (https://triplit.dev/docs/ssr) for more information.';
    this.status = STATUS_CODES['Service Unavailable'];
  }
}

export class WorkerInternalClientNotInitializedError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'WorkerInternalClientNotInitializedError';
    this.baseMessage =
      'Attemped to invoke a method on the internal worker client before it was initialized. Ensure that the WorkerClient in the main thread has been initialized before invoking methods on the client inside the worker.';
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

export class SessionRolesMismatchError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'SessionRolesMismatchError';
    this.baseMessage =
      'Attempted to use `TriplitClient.updateSessionToken` with a token that does not have the same roles as the current session token. `updateSessionToken` should only be used to refresh the session with the server to prevent token expiry. To connect with a new token with new roles, use `TriplitClient.endSession` and then `TriplitClient.startSession(...)` with the new token.';
    this.status = STATUS_CODES['Forbidden'];
  }
}

export class SessionAlreadyActiveError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'SessionAlreadyActiveError';
    this.baseMessage =
      'Attempted to start a new session when a session is already active. Call `TriplitClient.endSession()` before starting a new session.';
    this.status = STATUS_CODES['Forbidden'];
  }
}

export class TokenExpiredError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'TokenExpiredError';
    this.baseMessage =
      'The provided token has expired. Please ensure that you are using a fresh token when calling `startSession` or `updateSessionToken`.';
    this.status = STATUS_CODES['Unauthorized'];
  }
}
export class NoActiveSessionError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'NoActiveSessionError';
    this.baseMessage =
      'Attempted to perform an operation that requires an active session when no session is active. Call `TriplitClient.startSession(...)` to start a new session.';
    this.status = STATUS_CODES['Forbidden'];
  }
}

export class TokenDecodingError extends TriplitError {
  constructor(token: unknown, ...args: any[]) {
    super(...args);
    this.name = 'TokenDecodingError';
    this.baseMessage = `The provided token ("${token}") could not be decoded. Please ensure that you are using a valid JWT token.`;
    this.status = STATUS_CODES['Unauthorized'];
  }
}

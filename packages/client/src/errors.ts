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

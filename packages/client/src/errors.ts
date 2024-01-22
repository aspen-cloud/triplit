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

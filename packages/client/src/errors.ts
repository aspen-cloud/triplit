import { TriplitError, STATUS_CODES } from '@triplit/db';

export class UnrecognizedFetchPolicyError extends TriplitError {
  constructor(policy: string, ...args: any[]) {
    super(...args);
    this.name = 'UnrecognizedFetchPolicyError';
    this.message = 'The fetch policy ' + policy + ' is not recognized.';
    this.status = STATUS_CODES['Bad Request'];
  }
}

export class MissingConnectionInformationError extends TriplitError {
  constructor(...args: any[]) {
    super(...args);
    this.name = 'MissingConnectionInformationError';
    this.message =
      'Missing connection information. A token and server must be provided.';
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

export class RemoteSyncFailedError extends TriplitError {
  constructor(query: any, ...args: any[]) {
    super(...args);
    this.name = 'RemoteSyncFailedError';
    this.message =
      'Remote sync failed for query: ' + JSON.stringify(query, null, 2);
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

export class RemoteFetchFailedError extends TriplitError {
  constructor(query: any, ...args: any[]) {
    super(...args);
    this.name = 'RemoteFetchFailedError';
    this.message =
      'Remote fetch failed for query: ' + JSON.stringify(query, null, 2);
    this.status = STATUS_CODES['Internal Server Error'];
  }
}

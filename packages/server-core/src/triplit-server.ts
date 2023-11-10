import {
  DB as TriplitDB,
  CollectionQuery,
  TriplitError,
  schemaToJSON,
  hashSchemaJSON,
  Storage,
} from '@triplit/db';
import { ServiceKeyRequiredError } from './errors.js';
import { ParsedToken } from '@triplit/types/sync';
import { ConnectionOptions, Session } from './session.js';

/**
 * Represents a Triplit server for a speicific tenant.
 */
export class Server {
  constructor(public db: TriplitDB<any>) {}

  createSession(token: ParsedToken) {
    return new Session(this, token);
  }

  createConnection(token: ParsedToken, connectionOptions: ConnectionOptions) {
    const session = this.createSession(token);
    return session.createConnection(connectionOptions);
  }
}

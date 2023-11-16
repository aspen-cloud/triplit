import { DB as TriplitDB } from '@triplit/db';
import { ParsedToken } from '@triplit/types/sync';
import { Connection, ConnectionOptions, Session } from './session.js';

/**
 * Represents a Triplit server for a specific tenant.
 */
export class Server {
  private connections: Map<string, Connection> = new Map();

  constructor(public db: TriplitDB<any>) {}

  createSession(token: ParsedToken) {
    return new Session(this, token);
  }

  getConnection(clientId: string) {
    return this.connections.get(clientId);
  }

  openConnection(token: ParsedToken, connectionOptions: ConnectionOptions) {
    const session = this.createSession(token);
    const connection = session.createConnection(connectionOptions);
    this.connections.set(connectionOptions.clientId, connection);
    return connection;
  }

  closeConnection(clientId: string) {
    this.connections.delete(clientId);
  }
}

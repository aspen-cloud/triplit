import { KVStore, Models, Roles, TransactOptions } from '@triplit/db';
import { OnSessionErrorCallback, TokenRefreshOptions } from './sync.js';
import {
  ClientFetchOptions,
  SubscriptionOptions,
  SyncTransport,
} from '../../types.js';
import { Logger } from '../../@triplit/types/logger.js';

export interface ClientOptions<M extends Models<M> = Models> {
  /**
   * The schema used to validate database operations and provide type-hinting. Read more about schemas {@link https://www.triplit.dev/docs/schemas | here }
   */
  schema?: M;

  /**
   * The roles used to authorize database operations. Read more about roles {@link https://www.triplit.dev/docs/authorization | here }
   */
  roles?: Roles;
  /**
   * The token used to authenticate with the server. If not provided, the client will not connect to a server. Read more about tokens {@link https://www.triplit.dev/docs/auth | here }
   */
  token?: string;

  /**
   * A callback that is called when the client's connection to server closes due to a session-related error.
   */
  onSessionError?: OnSessionErrorCallback;

  /**
   *
   */
  refreshOptions?: TokenRefreshOptions;

  /**
   * The path to the claims in the token, if they are nested.
   */
  claimsPath?: string;

  /**
   * The URL of the server to connect to. If not provided, the client will not connect to a server.
   */
  serverUrl?: string;
  syncSchema?: boolean;
  transport?: SyncTransport;
  /**
   * Variables to initialized the database with. Read more about variables {@link https://www.triplit.dev/docs/client/query/variables | here }
   */
  variables?: Record<string, any>;
  clientId?: string;

  /**
   * The storage for the client cache. Can be `memory`, `indexeddb` or an object with `cache` and `outbox` properties. Defaults to `memory`. Read more about storage {@link https://www.triplit.dev/docs/client/storage | here }
   */
  storage?: SimpleStorageOrInstances;

  /**
   * Default options for fetch queries. Read more about fetch options {@link https://www.triplit.dev/docs/client/fetch#policy | here }
   */
  defaultQueryOptions?: {
    fetch?: ClientFetchOptions;
    subscription?: SubscriptionOptions;
  };

  /**
   * Whether the client should automatically connect to the server on initialization.
   */
  autoConnect?: boolean;
  logger?: Logger;

  /**
   * The log level for the client.
   * - `info`: Logs all messages
   * - `warn`: Logs warnings and errors
   * - `error`: Logs errors
   * - `debug`: Logs all messages and additional debug information
   */
  logLevel?: 'info' | 'warn' | 'error' | 'debug';
  skipRules?: boolean;

  experimental?: {};
}

export type SupportClientStorageProviders = 'indexeddb' | 'memory';

export type SimpleClientStorageOptions =
  | SupportClientStorageProviders
  | { type: SupportClientStorageProviders; name?: string };

export type SimpleStorageOrInstances = KVStore | SimpleClientStorageOptions;

// TODO: I think both `skipRules` and `manualSchemaRefresh` arent used / needed
export type ClientTransactOptions = Pick<TransactOptions, 'skipRules'> & {
  manualSchemaRefresh?: boolean;
};

export type ConnectionOptionsChange = Pick<
  ClientOptions,
  'token' | 'serverUrl'
> & { tokenRefresh?: boolean };
export type ConnectionOptionsChangeHandler = (
  params: ConnectionOptionsChange
) => void;

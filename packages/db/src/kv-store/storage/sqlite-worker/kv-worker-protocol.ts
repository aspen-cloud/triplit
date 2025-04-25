// kv-worker-protocol.ts
import type { Tuple } from '../../../codec.js'; // Adjust path as needed
import type { ScanOptions, CountOptions } from '../../../types.js'; // Adjust path as needed
import { SQLiteKVStoreOptions } from '../../utils/sqlite.js';

// --- Request Types (Main -> Worker) ---

export type WorkerOperation =
  | 'init'
  | 'get'
  | 'set'
  | 'delete'
  | 'scanStart' // Start iteration
  | 'scanNext' // Request next item (could be implicit after start)
  | 'scanDispose' // Clean up iterator if main thread stops early
  | 'scanValuesStart'
  | 'scanValuesNext'
  | 'scanValuesDispose'
  | 'count'
  | 'clear'
  | 'applyEdits'
  | 'close'; // Optional: Gracefully close DB

export type InitPayload = {
  databasePath: string; // Or maybe just ':memory:'
  options?: SQLiteKVStoreOptions;
};

export type GetPayload = { key: Tuple; scope?: Tuple };
export type SetPayload = { key: Tuple; value: any; scope?: Tuple };
export type DeletePayload = { key: Tuple; scope?: Tuple };
export type ScanStartPayload = { options: ScanOptions; scope?: Tuple };
export type ScanValuesStartPayload = { options: ScanOptions; scope?: Tuple };
// scanNext/Dispose might only need iteratorId
export type CountPayload = { options: CountOptions; scope?: Tuple };
export type ClearPayload = { scope?: Tuple };
export type ApplyEditsPayload = {
  sets: [Tuple, any][];
  deletes: Tuple[];
  scope?: Tuple; // ApplyEdits might operate within a scope if called via ScopedKVStore/MemoryTransaction
};

export type WorkerRequestPayload =
  | InitPayload
  | GetPayload
  | SetPayload
  | DeletePayload
  | ScanStartPayload
  | ScanValuesStartPayload
  | CountPayload
  | ClearPayload
  | ApplyEditsPayload
  | { iteratorId: number } // For scanNext/scanDispose
  | null; // For close

export interface WorkerRequest {
  id: number; // Unique request ID
  operation: WorkerOperation;
  payload: WorkerRequestPayload;
}

// --- Response Types (Worker -> Main) ---

export type WorkerResponseType =
  | 'initSuccess'
  | 'result' // General success result
  | 'scanIteratorId' // Response to scanStart, provides ID for subsequent requests
  | 'scanValuesIteratorId'
  | 'scanData' // A single item from a scan
  | 'scanValuesData'
  | 'scanComplete' // Scan finished successfully
  | 'scanValuesComplete'
  | 'error'; // General error or operation-specific error

export interface WorkerResponse {
  id: number; // Corresponds to request ID (or 0 for unsolicited like errors?)
  type: WorkerResponseType;
  payload?: any; // Result data, error details, iterator ID, etc.
  iteratorId?: number; // Link scan data/complete messages to the original request
}

// Helper type for pending requests on main thread
export type PendingRequest = {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
};

// Helper type for active iterators on main thread
export type ActiveScan = {
  id: number; // The original request ID that started the scan
  iteratorId: number; // The ID assigned by the worker
  buffer: any[]; // Buffer for incoming data items
  isComplete: boolean;
  error: any | null;
  waiter: { resolve: () => void; promise: Promise<void> } | null; // To signal data arrival
  onDispose: () => void; // Function to send dispose message to worker
};

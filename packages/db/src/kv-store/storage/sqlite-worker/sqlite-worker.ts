import Worker from 'web-worker';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  KVStore,
  KVStoreTransaction,
  ScanOptions,
  CountOptions,
} from '../../../types.js';
import type { Tuple } from '../../../codec.js';
import { MemoryTransaction } from '../../transactions/memory-tx.js';
import { ScopedKVStore } from '../../utils/scoped-store.js';
import { WorkerOperation } from './kv-worker-protocol.js';
import {
  ActiveScan,
  PendingRequest,
  WorkerRequest,
  WorkerResponse,
} from './kv-worker-protocol.js';

// Helper to get __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SqliteWorkerKvStore implements KVStore {
  private worker: Worker;
  private nextRequestId = 1;
  private pendingRequests = new Map<number, PendingRequest>();
  private activeScans = new Map<number, ActiveScan>(); // Key: original request ID
  private isInitialized = false;
  private initPromise: Promise<void>;
  private closed = false;

  constructor(databasePath: string) {
    // Resolve the worker script relative to this file
    const workerPath = path.resolve(__dirname, 'sqlite.worker.js'); // Use .js extension

    this.worker = new Worker(workerPath, { type: 'module' });
    // this.worker = new SqliteWorker();

    this.initPromise = new Promise((resolve, reject) => {
      // Send initialization message to worker
      const initRequest: WorkerRequest = {
        id: 0, // Use 0 for init
        operation: 'init',
        payload: { databasePath },
      };

      // Handler for the init response specifically
      const initHandler = (
        msg: MessageEvent<
          | WorkerResponse
          | { type: 'initSuccess' }
          | { type: 'error'; payload: any }
        >
      ) => {
        const response = msg.data;
        if (response.type === 'initSuccess') {
          this.isInitialized = true;
          this.worker.removeEventListener('message', initHandler); // Remove this specific handler
          this.worker.addEventListener(
            'message',
            this.handleWorkerMessage.bind(this)
          ); // Add general handler
          resolve();
        } else if (response.type === 'error') {
          console.error(
            'Main: Worker initialization failed:',
            response.payload
          );
          // @ts-expect-error
          this.worker.off('message', initHandler);
          this.worker.terminate(); // Failed init, terminate worker
          reject(
            new Error(`Worker initialization failed: ${response.payload}`)
          );
        }
        // Ignore other message types during init phase
      };
      this.worker.addEventListener('message', initHandler); // Use once for init response
      this.worker.addEventListener('error', (err) => {
        console.error('Main: Worker encountered an error:', err);
        this.cleanup(
          // @ts-expect-error
          err
        ); // Reject pending requests on worker error
        reject(err); // Reject init promise if error occurs during init
      });
      this.worker.addEventListener('exit', (code) => {
        if (
          // @ts-expect-error
          code !== 0
        ) {
          const error = new Error(`Worker stopped with exit code ${code}`);
          console.error('Main:', error);
          this.cleanup(error); // Reject pending requests on exit
          // Don't reject initPromise here if init already succeeded/failed
        } else {
          console.log('Main: Worker exited gracefully.');
          this.cleanup(new Error('Worker exited'));
        }
        this.closed = true; // Mark as closed on exit
      });

      this.worker.postMessage(initRequest);
    });
  }

  // Centralized message handler for post-initialization
  private handleWorkerMessage(msg: MessageEvent<WorkerResponse>): void {
    const response = msg.data;
    // Scan-related messages are routed by iteratorId within the payload or response itself
    if (
      response.type === 'scanData' ||
      response.type === 'scanValuesData' ||
      response.type === 'scanComplete' ||
      response.type === 'scanValuesComplete' ||
      (response.type === 'error' && response.iteratorId !== undefined)
    ) {
      this.handleScanMessage(response);
      return;
    }

    // Handle general results or errors linked by request ID
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      console.warn(
        `Main: Received unexpected message for ID ${response.id}, Type: ${response.type}`
      );
      return;
    }

    this.pendingRequests.delete(response.id); // Remove from pending map

    if (
      response.type === 'result' ||
      response.type === 'scanIteratorId' ||
      response.type === 'scanValuesIteratorId'
    ) {
      pending.resolve(response.payload);
    } else if (response.type === 'error') {
      pending.reject(new Error(response.payload || 'Unknown worker error'));
    } else {
      // Should not happen if scan messages are handled above, but acts as a fallback
      console.warn(
        `Main: Received unhandled message type ${response.type} for ID ${response.id}`
      );
      pending.reject(new Error(`Unhandled response type: ${response.type}`));
    }
  }

  // Specific handler for scan-related messages
  private handleScanMessage(response: WorkerResponse): void {
    const scanId = response.iteratorId; // The ID linking messages for a specific scan
    if (scanId === undefined) {
      console.error(
        'Main: Received scan message without iteratorId:',
        response
      );
      return;
    }

    // Find the active scan using the iteratorId. We need to search the map.
    let activeScan: ActiveScan | undefined;
    let originalRequestId: number | undefined;
    for (const [reqId, scan] of this.activeScans.entries()) {
      if (scan.iteratorId === scanId) {
        activeScan = scan;
        originalRequestId = reqId;
        break;
      }
    }

    if (!activeScan || originalRequestId === undefined) {
      // This can happen if the scan was already completed/closed or if the iteratorId is wrong
      console.warn(
        `Main: Received message for unknown or completed scan iterator ${scanId}, Type: ${response.type}`
      );
      // If it's an error for an unknown scan, we can't do much more.
      // If it's data/complete, maybe the main thread already disposed it.
      return;
    }

    switch (response.type) {
      case 'scanData':
      case 'scanValuesData':
        activeScan.buffer.push(response.payload);
        activeScan.waiter?.resolve(); // Signal data arrival
        break;
      case 'scanComplete':
      case 'scanValuesComplete':
        activeScan.isComplete = true;
        this.activeScans.delete(originalRequestId); // Clean up completed scan
        activeScan.waiter?.resolve(); // Signal completion
        break;
      case 'error':
        activeScan.error = new Error(
          response.payload || 'Unknown scan error in worker'
        );
        activeScan.isComplete = true; // Mark as complete due to error
        this.activeScans.delete(originalRequestId); // Clean up errored scan
        activeScan.waiter?.resolve(); // Signal completion (with error)
        // Note: The original promise for scanStart might have already resolved with iteratorId.
        // The error is now surfaced when the async iterator tries to get the next item.
        break;
    }
  }

  // Helper to send requests and return promises
  private async sendRequest<T = any>(
    operation: WorkerOperation,
    payload: WorkerRequest['payload']
  ): Promise<T> {
    if (this.closed) throw new Error('KVStore is closed.');
    await this.initPromise; // Ensure worker is initialized
    const id = this.nextRequestId++;
    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      const request: WorkerRequest = { id, operation, payload };
      try {
        this.worker.postMessage(request);
      } catch (error) {
        // Handle potential error during postMessage itself (e.g., worker terminated)
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  // --- KVStore Interface Implementation ---

  async get(key: Tuple, scope?: Tuple): Promise<any> {
    return this.sendRequest<any>('get', { key, scope });
  }

  async set(key: Tuple, value: any, scope?: Tuple): Promise<void> {
    await this.sendRequest<void>('set', { key, value, scope });
  }

  async delete(key: Tuple, scope?: Tuple): Promise<void> {
    await this.sendRequest<void>('delete', { key, scope });
  }

  async *scan(
    options: ScanOptions,
    scope?: Tuple
  ): AsyncIterable<[Tuple, any]> {
    if (this.closed) throw new Error('KVStore is closed.');
    await this.initPromise; // Ensure worker is ready before starting scan

    const scanRequestId = this.nextRequestId++; // ID for the initial 'scanStart' request
    let iteratorId: number | null = null;

    // Function to send dispose message if generator is exited early
    const sendDispose = () => {
      if (iteratorId !== null && this.activeScans.has(scanRequestId)) {
        this.activeScans.delete(scanRequestId); // Remove from main thread map first
        // console.debug(
        //   `Main: Sending scanDispose for iterator ${iteratorId} (req ${scanRequestId})`
        // );
        // Send dispose message non-blocking, fire-and-forget
        const disposeRequest: WorkerRequest = {
          id: this.nextRequestId++, // Use a new ID for the dispose message
          operation: 'scanDispose',
          payload: { iteratorId },
        };
        this.worker.postMessage(disposeRequest);
      }
      iteratorId = null; // Prevent sending dispose multiple times
    };

    try {
      // 1. Send scanStart and wait for the iteratorId
      iteratorId = await new Promise<number>((resolve, reject) => {
        this.pendingRequests.set(scanRequestId, { resolve, reject });
        const request: WorkerRequest = {
          id: scanRequestId,
          operation: 'scanStart',
          payload: { options, scope },
        };
        this.worker.postMessage(request);
      });

      // console.debug(
      //   `Main: Started scan req ${scanRequestId}, got iterator ${iteratorId}`
      // );

      // 2. Create and register the ActiveScan state for this generator instance
      const activeScan: ActiveScan = {
        id: scanRequestId,
        iteratorId: iteratorId,
        buffer: [],
        isComplete: false,
        error: null,
        waiter: null,
        onDispose: sendDispose, // Store the dispose function
      };
      this.activeScans.set(scanRequestId, activeScan);

      // 3. Loop requesting data
      while (true) {
        // If buffer has items, yield them first
        while (activeScan.buffer.length > 0) {
          const result = activeScan.buffer.shift(); // Shift from buffer
          const prefixLength = (scope?.length ?? 0) + options.prefix.length;
          const [key, value] = result as [Tuple, any]; // Cast to expected tuple type
          const keyWithoutPrefix =
            prefixLength > 0 && key.length > prefixLength
              ? key.slice(prefixLength) // Remove the scope prefix for yielding
              : key; // No scope, yield as-is
          yield [keyWithoutPrefix, value]; // Yield the key-value pair
        }

        // If scan completed (successfully or with error), exit loop
        if (activeScan.isComplete) {
          if (activeScan.error) {
            throw activeScan.error;
          }
          break; // Normal completion
        }

        // Buffer is empty, need more data. Create a waiter promise.
        if (!activeScan.waiter) {
          let resolver = () => {};
          const promise = new Promise<void>((resolve) => {
            resolver = resolve;
          });
          activeScan.waiter = { resolve: resolver, promise };
        }

        // Send request for next item ONLY IF NOT ALREADY COMPLETE
        if (!activeScan.isComplete) {
          const nextRequest: WorkerRequest = {
            id: this.nextRequestId++, // Use unique ID for each 'next' request
            operation: 'scanNext',
            payload: { iteratorId },
          };
          // We don't store a pending request for 'scanNext', results come via handleScanMessage
          this.worker.postMessage(nextRequest);
        }

        // Wait for signal (data arrival or completion)
        await activeScan.waiter.promise;
        activeScan.waiter = null; // Reset waiter for next iteration
        // Loop continues: check buffer, check completion status
      }
    } finally {
      // Ensure cleanup happens when generator loop exits (normally or via break/return/throw)
      // console.debug(
      //   `Main: Exiting scan generator for req ${scanRequestId}, iterator ${iteratorId}`
      // );
      sendDispose(); // Send dispose message if iteratorId was obtained
      this.activeScans.delete(scanRequestId); // Ensure removal from map
    }
  }

  async *scanValues(options: ScanOptions, scope?: Tuple): AsyncIterable<any> {
    if (this.closed) throw new Error('KVStore is closed.');
    await this.initPromise;

    const scanRequestId = this.nextRequestId++;
    let iteratorId: number | null = null;

    const sendDispose = () => {
      if (iteratorId !== null && this.activeScans.has(scanRequestId)) {
        this.activeScans.delete(scanRequestId);
        // console.debug(
        //   `Main: Sending scanValuesDispose for iterator ${iteratorId} (req ${scanRequestId})`
        // );
        const disposeRequest: WorkerRequest = {
          id: this.nextRequestId++,
          operation: 'scanValuesDispose',
          payload: { iteratorId },
        };
        this.worker.postMessage(disposeRequest);
      }
      iteratorId = null;
    };

    try {
      iteratorId = await new Promise<number>((resolve, reject) => {
        this.pendingRequests.set(scanRequestId, { resolve, reject });
        const request: WorkerRequest = {
          id: scanRequestId,
          operation: 'scanValuesStart',
          payload: { options, scope },
        };
        this.worker.postMessage(request);
      });

      // console.debug(
      //   `Main: Started scanValues req ${scanRequestId}, got iterator ${iteratorId}`
      // );

      const activeScan: ActiveScan = {
        id: scanRequestId,
        iteratorId: iteratorId,
        buffer: [],
        isComplete: false,
        error: null,
        waiter: null,
        onDispose: sendDispose,
      };
      this.activeScans.set(scanRequestId, activeScan);

      while (true) {
        while (activeScan.buffer.length > 0) {
          yield activeScan.buffer.shift()!;
        }

        if (activeScan.isComplete) {
          if (activeScan.error) throw activeScan.error;
          break;
        }

        if (!activeScan.waiter) {
          let resolver = () => {};
          const promise = new Promise<void>((resolve) => {
            resolver = resolve;
          });
          activeScan.waiter = { resolve: resolver, promise };
        }

        if (!activeScan.isComplete) {
          const nextRequest: WorkerRequest = {
            id: this.nextRequestId++,
            operation: 'scanValuesNext',
            payload: { iteratorId },
          };
          this.worker.postMessage(nextRequest);
        }

        await activeScan.waiter.promise;
        activeScan.waiter = null;
      }
    } finally {
      // console.debug(
      //   `Main: Exiting scanValues generator for req ${scanRequestId}, iterator ${iteratorId}`
      // );
      sendDispose();
      this.activeScans.delete(scanRequestId);
    }
  }

  async count(options: CountOptions, scope?: Tuple): Promise<number> {
    return this.sendRequest<number>('count', { options, scope });
  }

  async clear(scope?: Tuple): Promise<void> {
    await this.sendRequest<void>('clear', { scope });
  }

  scope(scopeTuple: Tuple): KVStore {
    // ScopedKVStore works by prepending the scope to keys before calling
    // the underlying store's methods (get, set, delete, scan, etc.).
    // This proxy correctly handles the 'scope' argument passed down,
    // so ScopedKVStore should work correctly with this proxy.
    return new ScopedKVStore(this, scopeTuple);
  }

  transact(): KVStoreTransaction {
    // MemoryTransaction accumulates edits in memory and then calls
    // applyEdits on the underlying store when committed.
    // This will work fine, calling applyEdits on this proxy.
    return new MemoryTransaction(this);
  }

  // Apply edits accumulated by MemoryTransaction or called directly
  async applyEdits(
    sets: AsyncIterable<[Tuple, any]> | Iterable<[Tuple, any]>,
    deletes: AsyncIterable<Tuple> | Iterable<Tuple>,
    // Scope might be passed by MemoryTransaction if it was created from a ScopedKVStore
    scope?: Tuple
  ): Promise<void> {
    // Accumulate edits on the main thread first (like original code)
    // This is important because the iterables might be complex/async
    const accumulatedSets: [Tuple, any][] = [];
    const accumulatedDeletes: Tuple[] = [];
    // Use for..await..of for both async and sync iterables
    for await (const edit of sets) {
      accumulatedSets.push(edit);
    }
    for await (const del of deletes) {
      accumulatedDeletes.push(del);
    }

    // Send the accumulated edits to the worker in one message
    await this.sendRequest<void>('applyEdits', {
      sets: accumulatedSets,
      deletes: accumulatedDeletes,
      scope,
    });
  }

  // Gracefully shutdown the worker
  async close(): Promise<void> {
    if (this.closed) return;
    console.log('Main: Requesting worker shutdown...');
    this.closed = true; // Prevent new requests

    // Wait for pending non-scan requests
    await Promise.allSettled(
      Array.from(this.pendingRequests.values()).map(
        (p) =>
          new Promise((res) => {
            p.resolve = res; // Re-route resolve/reject to just signal completion
            p.reject = res;
          })
      )
    );
    this.pendingRequests.clear();

    // Dispose all active scans
    for (const [reqId, scan] of this.activeScans.entries()) {
      scan.onDispose(); // Send dispose message
      // Optionally wait for dispose confirmation? For simplicity, we don't here.
    }
    this.activeScans.clear();

    // Send close message to worker (optional, but good for cleanup)
    try {
      await this.sendRequest<void>('close', null); // sendRequest handles initPromise internally
    } catch (e) {
      console.warn(
        'Main: Error sending close message to worker (might have already exited):',
        e
      );
    }

    // Terminate the worker
    await this.worker.terminate();
    console.log('Main: Worker terminated.');
  }

  // Cleanup function for errors or exit
  private cleanup(error: Error): void {
    this.closed = true; // Mark as closed

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests.entries()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();

    // Reject/cleanup all active scans
    for (const [id, scan] of this.activeScans.entries()) {
      scan.error = error;
      scan.isComplete = true;
      scan.waiter?.resolve(); // Unblock any waiting generator
    }
    this.activeScans.clear();
  }
}

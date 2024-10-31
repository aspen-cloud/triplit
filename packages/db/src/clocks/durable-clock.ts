import { nanoid } from 'nanoid';
import { Timestamp, timestampCompare } from '../timestamp.js';
import { TripleStore } from '../triple-store.js';
import { triplesToObject } from '../utils.js';
import { Clock } from './clock.js';

// Keep track of the clock in the database metadata
export class DurableClock implements Clock {
  private clock?: Timestamp;
  private scope?: string;
  private scopedStore?: TripleStore;

  private clockReady: Promise<void>;
  private readyCallbacks?: [() => void, (reason?: any) => void];
  private assigned?: boolean;
  private onClearUnsubscribe?: () => void;

  // THIS IS ONLY USED FOR INITIALIZING THE CLOCK
  // MANUAL ASSIGNMENTS ONLY HAVE USE CASES IN TESTING
  private clientId: string;

  constructor(clockScope?: string, clientId?: string) {
    this.scope = clockScope;
    this.clientId = clientId || nanoid();
    this.clockReady = new Promise(async (res, rej) => {
      // Await for clock.start to be called
      // This is admitedly a bit of an odd pattern
      this.readyCallbacks = [res, rej];
    });
  }

  async assignToStore(store: TripleStore) {
    if (this.assigned) return;
    this.assigned = true;
    const [res, rej] = this.readyCallbacks!;
    try {
      this.scopedStore = this.scope
        ? store.setStorageScope([this.scope])
        : store;

      // Initialize in memory clock with current stored clock or create a new one
      const clockTuples = await this.scopedStore.readMetadataTuples('clock');
      if (clockTuples.length === 0) {
        this.clock = [0, this.clientId];
        await this.scopedStore.updateMetadataTuples([
          ['clock', ['tick'], this.clock[0]],
          ['clock', ['clientId'], this.clock[1]],
        ]);
      } else {
        const { clock } = triplesToObject<{
          clock: { clientId: string; tick: number };
        }>(clockTuples);
        this.clock = [clock.tick, clock.clientId];
      }
      res();
    } catch (e) {
      console.error(e);
      return rej(e);
    }

    // Use beforeCommit hook to update clock tuples in same transaction and avoid async issue
    store.beforeCommit(async (storeTriples) => {
      let maxTimestamp: Timestamp | undefined = undefined;
      for (const triples of Object.values(storeTriples)) {
        for (const triple of triples) {
          if (timestampCompare(triple.timestamp, maxTimestamp) > 0) {
            maxTimestamp = triple.timestamp;
          }
        }
      }
      await this.clockReady;
      if (timestampCompare(maxTimestamp, this.clock) > 0) {
        this.scopedStore!.updateMetadataTuples([
          ['clock', ['tick'], maxTimestamp![0]],
          ['clock', ['clientId'], this.clock![1]],
        ]);
      }
    });
    // Use after commit hook to update cached clock data
    store.afterCommit(async (storeTriples) => {
      let maxTimestamp: Timestamp | undefined = undefined;
      for (const triples of Object.values(storeTriples)) {
        for (const triple of triples) {
          if (timestampCompare(triple.timestamp, maxTimestamp) > 0) {
            maxTimestamp = triple.timestamp;
          }
        }
      }
      await this.clockReady;
      if (timestampCompare(maxTimestamp, this.clock) > 0) {
        this.clock = [maxTimestamp![0], this.clock![1]];
      }
    });

    this.onClearUnsubscribe?.();
    this.onClearUnsubscribe = store.onClear(async () => {
      this.assigned = false;
      this.clientId = nanoid();
      this.clockReady = new Promise(async (res, rej) => {
        // Await for clock.start to be called
        // This is admitedly a bit of an odd pattern
        this.readyCallbacks = [res, rej];
      });
      await this.assignToStore(store);
    });
  }

  async getCurrentTimestamp() {
    await this.clockReady;
    return this.clock!;
  }

  async getNextTimestamp() {
    const [tick, clientId] = await this.getCurrentTimestamp();
    const nextTimestamp = [tick + 1, clientId] as Timestamp;
    return nextTimestamp;
  }

  async setTick(tick: number) {
    await this.clockReady;
    this.clock = [tick, this.clock![1]];
    this.scopedStore!.updateMetadataTuples([['clock', ['tick'], tick]]);
  }
}

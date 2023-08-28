import { nanoid } from 'nanoid';
import { Timestamp, timestampCompare } from '../timestamp';
import { TripleStore } from '../triple-store';
import { triplesToObject } from '../utils';
import { Clock } from './clock';

// Keep track of the clock in the database metadata
export class DurableClock implements Clock {
  private clock?: Timestamp;
  private scope: string;
  private scopedStore?: TripleStore;

  private clockReady: Promise<void>;
  private readyCallbacks?: [() => void, (reason?: any) => void];
  private assigned?: boolean;
  private clientId: string;

  constructor(clockScope: string, clientId?: string) {
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
      this.scopedStore = store.setStorageScope([this.scope]);

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

    // Listen on all storages for new timestamps
    store.onInsert(async (triples) => {
      const maxTimestamp = triples.reduce<Timestamp | undefined>(
        (max, triple) =>
          timestampCompare(triple.timestamp, max) > 0 ? triple.timestamp : max,
        undefined
      );
      await this.clockReady;
      if (timestampCompare(maxTimestamp, this.clock) > 0) {
        this.clock = [maxTimestamp![0], this.clock![1]];
        this.scopedStore!.updateMetadataTuples([
          ['clock', ['tick'], this.clock![0]],
          ['clock', ['clientId'], this.clock![1]],
        ]);
      }
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

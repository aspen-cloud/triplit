import { Timestamp } from '../timestamp.js';
import { TripleStore } from '../triple-store.js';

export interface Clock {
  assignToStore(store: TripleStore): Promise<void>;
  getCurrentTimestamp(): Promise<Timestamp>;
  getNextTimestamp(): Promise<Timestamp>;
  setTick(tick: number): Promise<void>;
  clockReady: Promise<void>;
}

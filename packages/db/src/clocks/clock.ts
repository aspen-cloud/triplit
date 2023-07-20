import { Timestamp } from '../timestamp';
import { TripleStore } from '../triple-store';

export interface Clock {
  assignToStore(store: TripleStore): Promise<void>;
  getCurrentTimestamp(): Promise<Timestamp>;
  getNextTimestamp(): Promise<Timestamp>;
  setTick(tick: number): Promise<void>;
}

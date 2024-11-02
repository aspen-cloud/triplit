import { nanoid } from 'nanoid';
import { Timestamp } from '../timestamp.js';
import { TripleStore } from '../triple-store.js';
import { Clock } from './clock.js';

export class MemoryClock implements Clock {
  clientId: string;
  tick: number;
  clockReady: Promise<void> = Promise.resolve();
  constructor({ clientId, tick }: { clientId?: string; tick?: number } = {}) {
    this.clientId = clientId ?? nanoid();
    this.tick = tick ?? 0;
  }

  async assignToStore(store: TripleStore): Promise<void> {
    const maxTs = await store.findMaxClientTimestamp(this.clientId);
    if (maxTs) this.setTick(maxTs[0]);
    store.afterCommit((inserts) => {
      const allTriples = Object.values(inserts).flat();
      allTriples.forEach(({ timestamp }) => {
        if (this.tick < timestamp[0]) this.setTick(timestamp[0]);
      });
    });
  }

  getCurrentTimestamp(): Promise<Timestamp> {
    return new Promise((res) => res([this.tick, this.clientId]));
  }

  // Relying on something else to push the clock forward on triple confirmation
  // I think things being sync keeps some weird sitatuions from happening
  // An atomic transaction with multiple changes to the same attribute may not work because they might be assigned the same clock
  // Ex. the document API assigned the same clock to changes (but the attributes are all different)
  getNextTimestamp(): Promise<Timestamp> {
    const nextTimestamp = [++this.tick, this.clientId] as [number, string];
    return new Promise((res) => res(nextTimestamp));
  }

  setTick(tick: number): Promise<void> {
    this.tick = tick;
    return new Promise((res) => res());
  }
}

import { nanoid } from 'nanoid';
import { Timestamp } from '../timestamp.js';
import { TripleStore } from '../triple-store.js';
import { Clock } from './clock.js';

export class MemoryClock implements Clock {
  clientId: string;
  tick: number;
  clockReady: Promise<void>;
  private readyCallbacks?: [() => void, (reason?: any) => void];
  constructor({ clientId, tick }: { clientId?: string; tick?: number } = {}) {
    this.clientId = clientId ?? nanoid();
    this.tick = tick ?? 0;
    this.clockReady = new Promise(async (res, rej) => {
      this.readyCallbacks = [res, rej];
    });
  }

  async assignToStore(store: TripleStore): Promise<void> {
    const [res, rej] = this.readyCallbacks!;
    try {
      store.afterCommit(async (inserts) => {
        const allTriples = Object.values(inserts).flat();
        await this.clockReady;
        allTriples.forEach(({ timestamp }) => {
          if (this.tick < timestamp[0]) this.setTick(timestamp[0]);
        });
      });
      const maxTs = await store.findMaxClientTimestamp(this.clientId);
      if (maxTs) this.setTick(maxTs[0]);
      res();
    } catch (e) {
      console.error(e);
      return rej(e);
    }
  }

  async getCurrentTimestamp(): Promise<Timestamp> {
    await this.clockReady;
    return [this.tick, this.clientId];
  }

  // Relying on something else to push the clock forward on triple confirmation
  // I think things being sync keeps some weird sitatuions from happening
  // An atomic transaction with multiple changes to the same attribute may not work because they might be assigned the same clock
  // Ex. the document API assigned the same clock to changes (but the attributes are all different)
  async getNextTimestamp(): Promise<Timestamp> {
    await this.clockReady;
    const nextTimestamp = [++this.tick, this.clientId] as [number, string];
    return nextTimestamp;
  }

  async setTick(tick: number): Promise<void> {
    await this.clockReady;
    this.tick = tick;
  }
}

// export type Timestamp = [number, number, string];
import { Timestamp } from '@triplit/types/sync.js';

// TODO use KV / make durable
export class HybridLogicalClock {
  private lastPhysicalTimeMs: number;
  private lastLogicalTime: number;
  readonly clientId: string = '';
  constructor(options: {
    clientId: string;
    lastPhysicalTimeMs?: number;
    lastLogicalTime?: number;
  }) {
    this.clientId = options.clientId;
    this.lastPhysicalTimeMs = options.lastPhysicalTimeMs || 0;
    this.lastLogicalTime = options.lastLogicalTime || 0;
  }

  get currentPhysicalTimeMs(): number {
    return Date.now();
  }

  current(): Timestamp {
    return [this.currentPhysicalTimeMs, this.lastLogicalTime, this.clientId];
  }

  next(): Timestamp {
    const physicalTimeMs = this.currentPhysicalTimeMs;
    if (physicalTimeMs > this.lastPhysicalTimeMs) {
      this.lastPhysicalTimeMs = physicalTimeMs;
      this.lastLogicalTime = 0;
    } else {
      this.lastLogicalTime += 1;
    }
    return [this.lastPhysicalTimeMs, this.lastLogicalTime, this.clientId];
  }

  updatePhysicalTimeMs(physicalTimeMs: number) {
    this.lastPhysicalTimeMs = physicalTimeMs;
  }

  static compare(a: Timestamp, b: Timestamp): number {
    if (a[0] === b[0]) {
      if (a[1] === b[1]) {
        return a[2].localeCompare(b[2]);
      }
      return a[1] - b[1];
    }
    return a[0] - b[0];
  }

  static MIN: Readonly<Timestamp> = Object.freeze([0, 0, '']);
}

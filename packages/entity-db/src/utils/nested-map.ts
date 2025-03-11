export class NestedMap<K1, K2, T> {
  data: Map<K1, Map<K2, T>> = new Map();

  get(k1: K1): Map<K2, T> | undefined;
  get(k1: K1, k2: K2): T | undefined;
  get(k1: K1, k2?: K2): Map<K2, T> | T | undefined {
    if (k2 === undefined) {
      return this.data.get(k1);
    }
    return this.data.get(k1)?.get(k2);
  }

  set(k1: K1, k2: K2, value: T): void {
    if (!this.data.has(k1)) {
      this.data.set(k1, new Map());
    }
    this.data.get(k1)!.set(k2, value);
  }

  delete(k1: K1, k2: K2): boolean {
    return this.data.get(k1)?.delete(k2) ?? false;
  }

  has(k1: K1): boolean;
  has(k1: K1, k2: K2): boolean;
  has(k1: K1, k2?: K2): boolean {
    if (k2 === undefined) {
      return this.data.has(k1);
    }
    return this.data.get(k1)?.has(k2) ?? false;
  }

  keys(): IterableIterator<K1> {
    return this.data.keys();
  }

  values(): IterableIterator<Map<K2, T>> {
    return this.data.values();
  }

  entries(): IterableIterator<[K1, Map<K2, T>]> {
    return this.data.entries();
  }

  [Symbol.iterator](): IterableIterator<[K1, Map<K2, T>]> {
    return this.entries();
  }
}

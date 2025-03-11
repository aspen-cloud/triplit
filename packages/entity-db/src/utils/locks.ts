export class Mutex {
  #lockReleasePromise: Promise<void> | null = null;
  async acquireLock(): Promise<Disposable> {
    if (this.#lockReleasePromise) {
      await this.#lockReleasePromise;
    }

    const { resolve, reject, promise } = Promise.withResolvers<void>();
    this.#lockReleasePromise = promise;

    return {
      [Symbol.dispose]: () => {
        this.#lockReleasePromise = null;
        resolve!();
      },
    };
  }
}

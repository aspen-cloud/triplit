export async function performInBatches<T>(
  fn: (batch: T[]) => void | Promise<void>,
  items: T[],
  batchSize: number
) {
  let i = 0;
  while (i < items.length) {
    const batch = items.slice(i, i + batchSize);
    await new Promise<void>((resolve) =>
      setTimeout(async () => {
        await fn(batch);
        resolve();
      }, 0)
    );
    i += batchSize;
  }
}

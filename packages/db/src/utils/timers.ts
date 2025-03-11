// Equivalent of node:timers/setImmediate
const eventLoopYieldCallback =
  typeof globalThis.setImmediate === 'function'
    ? globalThis.setImmediate
    : globalThis.queueMicrotask;
export async function yieldToEventLoop() {
  return new Promise((resolve) => {
    eventLoopYieldCallback(resolve);
  });
}

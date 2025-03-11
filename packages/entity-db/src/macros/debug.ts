export function debugFreeze<T>(obj: T): T {
  if (
    process.env.NODE_ENV === 'development' ||
    process.env.NODE_ENV === 'test'
  ) {
    // Object.freeze(obj);
  }
  return obj;
}

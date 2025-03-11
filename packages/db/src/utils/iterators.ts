export function* iterFromIndex<T>(
  array: T[],
  index: number
): Generator<T, void, unknown> {
  for (let i = index; i < array.length; i++) {
    yield array[i];
  }
}

export function* iterFilter<T>(
  iterator: Iterable<T>,
  predicate: (value: T) => boolean
): Generator<T, void, unknown> {
  for (const value of iterator) {
    if (predicate(value)) {
      yield value;
    }
  }
}

export function* iterConcat<T>(
  ...iterators: Iterable<T>[]
): Generator<T, void, unknown> {
  for (const iterator of iterators) {
    for (const value of iterator) {
      yield value;
    }
  }
}

export function* iterUnique<T>(
  iterator: Iterable<T>
): Generator<T, void, unknown> {
  const seen = new Set<T>();
  for (const value of iterator) {
    if (!seen.has(value)) {
      seen.add(value);
      yield value;
    }
  }
}

export function* iterMap<T, U>(
  iterator: Iterable<T>,
  mapper: (value: T) => U
): Generator<U, void, unknown> {
  for (const value of iterator) {
    yield mapper(value);
  }
}

// Return an empty iterator
export function iterEmpty() {
  return (function* () {})();
}

// AsyncIterable

export async function* asyncIterTake(
  iterator: AsyncIterable<any> | Iterable<any>,
  count: number
): AsyncGenerator<any, void, unknown> {
  let i = 0;
  for await (const result of iterator) {
    if (i >= count) {
      return;
    }
    yield result;
    i++;
  }
}

export async function* asyncIterFilter<T>(
  iterator: AsyncIterable<T> | Iterable<T>,
  predicate: (value: T) => boolean | Promise<boolean>
): AsyncGenerator<T, void, unknown> {
  for await (const result of iterator) {
    if (await predicate(result)) {
      yield result;
    }
  }
}

export async function* asyncIterConcat<T>(
  ...iterators: (AsyncIterable<T> | Iterable<T>)[]
): AsyncGenerator<T, void, unknown> {
  for (const iterator of iterators) {
    for await (const result of iterator) {
      yield result;
    }
  }
}

export async function* asyncIterUnique<T>(
  iterator: AsyncIterable<T> | Iterable<T>,
  getId?: (value: T) => any
): AsyncGenerator<T, void, unknown> {
  const seen = new Set<T>();
  for await (const result of iterator) {
    const id = getId ? getId(result) : result;
    if (!seen.has(id)) {
      seen.add(id);
      yield result;
    }
  }
}

export async function* asyncIterMap<T, U>(
  iterator: AsyncIterable<T> | Iterable<T>,
  mapper: (value: T) => U
): AsyncGenerator<U, void, unknown> {
  for await (const item of iterator) {
    yield mapper(item);
  }
}

export async function asyncIterEvery<T>(
  iterator: AsyncIterable<T> | Iterable<T>,
  predicate: (value: T) => boolean | Promise<boolean>
): Promise<boolean> {
  // TODO: look into using sync iterator when possible
  for await (const item of iterator) {
    if (!(await predicate(item))) {
      return false;
    }
  }
  return true;
}

export async function asyncIterSome<T>(
  iterator: AsyncIterable<T> | Iterable<T>,
  predicate: (value: T) => boolean | Promise<boolean>
): Promise<boolean> {
  for await (const item of iterator) {
    if (await predicate(item)) {
      return true;
    }
  }
  return false;
}

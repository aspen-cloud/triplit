export async function genToArr<T>(generator: AsyncGenerator<T>): Promise<T[]> {
  const arr = [];
  for await (const item of generator) {
    arr.push(item);
  }
  return arr;
}

export async function* arrToGen<T>(
  array: T[] | Promise<T[]>
): AsyncGenerator<T> {
  for await (const item of await array) {
    yield item;
  }
}

export function mapGen<T, R>(
  iterable: AsyncIterable<T>,
  cb: (value: T, index: number, state: any) => R
): AsyncIterable<R> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<R> {
      const i = iterable[Symbol.asyncIterator]();
      const state: any = {};
      let index = 0;
      return {
        async next(): Promise<IteratorResult<R>> {
          const a = await i.next();
          return a.done
            ? a
            : {
                value: cb(a.value, index++, state),
                done: false,
              };
        },
      };
    },
  };
}

export function distinctGen<T>(
  iterable: AsyncIterable<T> | Iterable<T>,
  cb?: (value: T) => any
): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      const i = isAsyncIterable(iterable)
        ? iterable[Symbol.asyncIterator]()
        : iterable[Symbol.iterator]();
      const set = new Set();
      return {
        async next(): Promise<IteratorResult<T>> {
          while (true) {
            const a = await i.next();
            if (a.done) {
              return a;
            }
            const key = cb ? cb(a.value) : a.value;
            if (!set.has(key)) {
              set.add(key);
              return a;
            }
          }
        },
      };
    },
  };
}

function isAsyncIterable<T>(
  iter: AsyncIterable<T> | Iterable<T>
): iter is AsyncIterable<T> {
  return Symbol.asyncIterator in iter;
}

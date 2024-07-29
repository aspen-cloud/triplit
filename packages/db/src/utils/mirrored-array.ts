export function MirroredArray<T>(...arrays: T[][]): T[] {
  return new Proxy([], {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && !isNaN(+prop)) {
        let index = Number(prop);
        for (let arr of arrays) {
          if (index < arr.length) {
            return arr[index];
          }
          index -= arr.length;
        }
      }
      if (prop === 'length') {
        return arrays.reduce((sum, arr) => sum + arr.length, 0);
      }
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      if (typeof prop === 'string' && !isNaN(+prop)) {
        let index = Number(prop);
        for (let arr of arrays) {
          if (index < arr.length) {
            return true;
          }
          index -= arr.length;
        }
      }
      return prop in target;
    },
  });
}

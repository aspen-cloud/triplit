export function createMultiProxy<T>(
  [primary, ...shadows]: T[],
  [primaryScope, ...shadowScopes]: any[] = []
): T {
  // if (typeof primary !== typeof secondary) throw new Error("types must match to create shadow");
  if (typeof primary === null) return primary;
  if (typeof primary === 'function') {
    // @ts-ignore
    return (...args: any[]) => {
      const primaryReturn = primary.apply(primaryScope, args);
      const shadowReturns = shadows.map((shadow, i) =>
        (shadow as T & Function).apply(shadowScopes[i], args)
      );
      return createMultiProxy(
        [primaryReturn, ...shadowReturns],
        [primary, ...shadows]
      );
    };
  }
  if (typeof primary === 'object') {
    // @ts-ignore
    return new Proxy(primary as object, {
      get(target, prop, receiver) {
        return createMultiProxy(
          [
            Reflect.get(target, prop, receiver),
            ...shadows.map((shadow) => Reflect.get(shadow as object, prop)),
          ],
          [primary, ...shadows]
        );
      },
    });
  }
  return primary;
}

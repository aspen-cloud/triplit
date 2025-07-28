/**
 * Flips a boolean type
 */
export type Not<T extends boolean> = T extends true ? false : true;

/**
 * Just the string portion of `keyof`
 *
 * This prevents `keyof` from returning `number | Symbol` keys
 */
// TODO: improve this to allow for numeric keys, when changing to keyof T & (string | number) some compiler error occurs
export type StringKey<T> = keyof T & string;

/**
 * Transforms a complex nested type to a readable type
 */
export type Unalias<T> =
  T extends Map<infer K, infer V>
    ? Map<K, Unalias<V>>
    : T extends Set<infer V>
      ? Set<Unalias<V>>
      : T extends Date
        ? T
        : T extends Array<infer U>
          ? Array<Unalias<U>>
          : T extends Record<string, unknown>
            ? { [K in keyof T]: Unalias<T[K]> }
            : T;

/**
 * Transforms a Readonly type to a mutable type
 */
export type Writeable<T> = { -readonly [P in keyof T]: T[P] };

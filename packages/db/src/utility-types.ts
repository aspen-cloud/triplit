/**
 * Match on the first values of a Tuple T
 * Useful for matching on various EAV tuples
 */
export type TuplePrefix<T extends any[]> = [...T, ...any[]];

/**
 * A record R filtered to only include keys K
 */
export type FilteredRecord<
  K extends ReadonlyArray<string>, // Return keys
  R extends { [P in K[number]]: any } // Return types
> = K extends ReadonlyArray<string> ? { [Key in K[number]]: R[Key] } : never;

/**
 * Utility for conditional types to check if a type is any because all types extend any
 * @example
 * type Foo<M> = IsAny<M> extends true ? 'any' : 'not any';
 */
export type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * Check if a type is unknown or undefined
 */
export type IsUnknownOrUndefined<T> = unknown extends T
  ? true
  : undefined extends T
  ? true
  : false;

/**
 * Flips a boolean type
 */
export type Not<T extends boolean> = T extends true ? false : true;

/**
 * Adds a prefix to a union type
 */
export type PrefixedUnion<
  Union extends string,
  Prefix extends string = ''
> = `${Prefix}${Union}`;

/**
 * Basic interface for a functional builder
 */
export type BuilderBase<
  T,
  Ignore extends string = never,
  Extend extends string = never
> = {
  [K in keyof Omit<T, Ignore> | Extend]-?: (...args: any) => any;
} & { build: () => T };

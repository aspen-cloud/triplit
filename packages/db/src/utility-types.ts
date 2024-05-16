// Match on the first values of a Tuple T
// Useful for matching on various EAV tuples
export type TuplePrefix<T extends any[]> = [...T, ...any[]];

// A record R filtered to only include keys K
export type FilteredRecord<
  K extends ReadonlyArray<string>, // Return keys
  R extends { [P in K[number]]: any } // Return types
> = K extends ReadonlyArray<string> ? { [Key in K[number]]: R[Key] } : never;

export type IsAny<T> = 0 extends 1 & T ? true : false;

// Check if a type is unknown or undefined
export type IsUnknownOrUndefined<T> = unknown extends T
  ? true
  : undefined extends T
  ? true
  : false;

// Flips a boolean
export type Not<T extends boolean> = T extends true ? false : true;

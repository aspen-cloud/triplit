import { ValueType } from '../../data-types/types/index.js';
import { TypeInterface } from '../../data-types/definitions/type.js';
import { Optional } from '../../data-types/types/index.js';
import { IsUnknownOrUndefined, Not } from '../../utility-types.js';

/**
 * Returns true if the property has no default value, otherwise false.
 */
export type PropertyHasNoDefault<T extends TypeInterface> =
  T extends TypeInterface
    ? T extends ValueType<infer TypeOptions>
      ? IsUnknownOrUndefined<TypeOptions['default']>
      : false // sets and records always have defaults (might want to refactor based on return type of default())
    : never;

/**
 * Returns true if the property has a default value, otherwise false.
 */
export type PropertyHasDefault<T extends TypeInterface> = Not<
  PropertyHasNoDefault<T>
>;

/**
 * Returns true if the property is optional, otherwise false.
 */
export type IsPropertyOptional<T extends TypeInterface> =
  T extends Optional<T> ? true : false;

/**
 * Returns true if the property is required, otherwise false.
 */
export type IsPropertyRequired<T extends TypeInterface> = Not<
  IsPropertyOptional<T>
>;

/**
 * Returns true if the property can be omitted when inserting, otherwise false.
 */
export type IsPropertyInsertOptional<T extends TypeInterface> =
  T extends TypeInterface
    ? // If the type has a default or is optional, it can be omitted
      PropertyHasNoDefault<T> extends true
      ? IsPropertyRequired<T> extends true
        ? false
        : true
      : true
    : never;

/**
 * Returns true if the property must be included when inserting, otherwise false.
 */
export type IsPropertyInsertRequired<T extends TypeInterface> = Not<
  IsPropertyInsertOptional<T>
>;

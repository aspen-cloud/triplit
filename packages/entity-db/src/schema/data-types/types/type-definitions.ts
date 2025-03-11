import { DEFAULT_FUNCTIONS } from '../constants.js';

/**
 * The base type for type definitions in the schema
 *
 * @template TypeId - The type id of the type definition
 * @template Config - The configuration object for the type definition. This should be as literal as possible (ie `{ nullable: true }`, not `{ nullable: boolean }`).
 */
export type TypeInterface<
  TypeId extends string = string,
  Config extends TypeConfig = {},
> = {
  type: TypeId;
  config?: Config;
};

/**
 * The configuration properties for all types in the schema. The type allows for any extensions to be added.
 *
 * @property optional - If the type is optional, from the perspective of a record property
 * @property nullable - If the type is nullable, from the perspective of a record property
 * @property default - The default value for the type
 */
export type TypeConfig = {
  optional?: true | false;
  nullable?: true | false;
  default?: any; // TODO: DefaultValue
} & {
  // Allow any other properties to be added, helpful when infering `TypeInterface<infer TypeId, infer Config>`
  [Opt: string]: any;
};

/**
 * The configuration literal for an optional property
 */
export type Optional = { optional: true };

/**
 * Transform a type to be optional
 *
 * @template T - The type to transform
 */
export type OptionalType<T extends TypeInterface<any, any>> =
  T extends TypeInterface<infer TypeId, infer Config>
    ? // T & ... to keep additional props, probably a better way to do this
      TypeInterface<TypeId, Config & { optional: true }> &
        Omit<T, keyof TypeInterface>
    : never;

/**
 * The configuration literal for a nullable property
 */
export type Nullable = { nullable: true };

/**
 * Transform a type to be nullable
 *
 * @template T - The type to transform
 */
export type NullableType<T extends TypeInterface<any, any>> =
  T extends TypeInterface<infer TypeId, infer Config>
    ? TypeInterface<TypeId, Config & { nullable: true }>
    : never;

/**
 * When defining a type, the base options each type can have. Thi is only a suggestion and each type may configure its own options.
 */
export type BaseTypeOptions = {
  optional?: true | false;
  nullable?: true | false;
  default?: any; // DefaultValue
};

/**
 * 'optional' is not part of the user facing api so we omit it
 */
export type OptionsInput<O extends BaseTypeOptions> = Omit<O, 'optional'>;

export type DefaultValue = null | string | number | boolean | DefaultFunction;
export type DefaultFunctionId = (typeof DEFAULT_FUNCTIONS)[number];
export type DefaultFunction = {
  args?: any[] | null | undefined;
  func: DefaultFunctionId;
};

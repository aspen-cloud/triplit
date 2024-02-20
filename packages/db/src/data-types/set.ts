import {
  InvalidSchemaOptionsError,
  InvalidSetTypeError,
  NotImplementedError,
  DBSerializationError,
  JSONValueParseError,
  JSToJSONValueParseError,
} from '../errors.js';
import { TimestampType, ValueType } from './base.js';
import { CollectionInterface } from './collection.js';
import {
  CollectionAttributeDefinition,
  UserTypeOptions,
  VALUE_TYPE_KEYS,
  ValueAttributeDefinition,
} from './serialization.js';
import { ExtractJSType } from './type.js';
import { ChangeTracker } from '../db-transaction.js';
import { TypeWithOptions } from './value.js';

const SET_OPERATORS = ['=', '!='] as const;
type SetOperators = typeof SET_OPERATORS;

export type SetType<
  Items extends ValueType<any>,
  TypeOptions extends UserTypeOptions = {}
> = CollectionInterface<
  'set',
  TypeWithOptions<Set<ExtractJSType<Items>>, TypeOptions>,
  Record<string, boolean>,
  Record<string, [boolean, TimestampType]>, // TODO: should be based on the type of the key
  SetOperators
>;

export function SetType<
  Items extends ValueType<any>,
  TypeOptions extends UserTypeOptions = {}
>(
  items: Items,
  options: TypeOptions = {} as TypeOptions
): SetType<Items, TypeOptions> {
  if (!VALUE_TYPE_KEYS.includes(items.type))
    throw new InvalidSetTypeError(items.type);
  if (items.options?.nullable)
    throw new InvalidSchemaOptionsError(
      'Set types cannot contain nullable types'
    );
  return {
    type: 'set',
    supportedOperations: SET_OPERATORS,
    context: {},
    items,
    options,
    toJSON(): CollectionAttributeDefinition {
      return {
        type: this.type,
        items: this.items.toJSON() as ValueAttributeDefinition,
        options: this.options,
      };
    },

    convertInputToDBValue(val: Set<any>) {
      const invalidReason = this.validateInput(val);
      if (invalidReason)
        throw new DBSerializationError(
          `set<${items.type}>`,
          val,
          invalidReason
        );
      if (options.nullable && val === null) return null;
      return [...val.values()].reduce((acc, key) => {
        return { ...acc, [key as string]: true };
      }, {});
    },
    // @ts-ignore
    convertJSONToJS(val: any[]) {
      if (options.nullable && val === null) return null;
      if (!Array.isArray(val))
        throw new JSONValueParseError(`set<${this.items.type}>`, val);
      return new Set(val);
    },
    defaultInput() {
      return new Set();
    },
    // @ts-ignore
    convertDBValueToJS(val) {
      if (options.nullable && val === null) return null;
      return new Set(
        Object.entries(val)
          .filter(([_k, v]) => !!v)
          .map(([k, _v]) => this.items.fromString(k) as ExtractJSType<Items>)
      );
    },
    convertJSToJSON(val) {
      if (options.nullable && val === null) return null;
      if (!(val instanceof Set))
        throw new JSToJSONValueParseError(`set<${this.items.type}>`, val);
      return [...val.values()];
    },
    validateInput(val: any) {
      if (options.nullable === true && val === null) return;
      // must be a set
      if (!(val instanceof Set))
        return `Expected Set, got ${betterTypeOf(val)}`;
      const values = Array.from(val.values());
      // cannot have null values
      if (values.includes(null)) return 'Set cannot contain null values';
      // must match items schema
      const invalid = values.reduce<[any, string] | undefined>((reason, v) => {
        if (reason) return reason;
        const invalidReason = this.items.validateInput(v);
        if (invalidReason) return [v, invalidReason];
        return undefined;
      }, undefined);
      if (invalid)
        return `Invalid value ${invalid[0]} for set<${items.type}>. Reason: ${invalid[1]}.`;
      return;
    },
    validateTripleValue(_val: any) {
      throw new NotImplementedError('Set validation');
    },
  };
}

function betterTypeOf(value: any): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Set) return 'set';
  if (value instanceof Map) return 'map';
  return typeof value;
}

class SetUpdateProxy<T> {
  constructor(
    public changeTracker: ChangeTracker,
    private prefix: string,
    public schema: SetType<ValueType<any>, any>
  ) {}
  add(value: T) {
    const serializedValue = this.schema.items.convertInputToDBValue(
      // @ts-ignore
      value
    );
    this.changeTracker.set(
      [...this.prefix.split('/'), serializedValue].join('/'),
      true
    );
  }
  clear(): void {
    const values = getSetFromChangeTracker(this.changeTracker, this.prefix);
    values.forEach((v) => {
      this.changeTracker.set([...this.prefix.split('/'), v].join('/'), false);
    });
  }
  delete(value: T) {
    const serializedValue = this.schema.items.convertInputToDBValue(
      // @ts-ignore
      value
    );
    if (
      this.changeTracker.get(
        [...this.prefix.split('/'), serializedValue].join('/')
      )
    ) {
      this.changeTracker.set(
        [...this.prefix.split('/'), serializedValue].join('/'),
        false
      );
    }
  }
}

function getSetFromChangeTracker(
  changeTracker: ChangeTracker,
  setPointer: string
) {
  const baseValues = Object.entries(changeTracker.get(setPointer))
    .filter(([_k, v]) => !!v)
    .map(([k, _v]) => k);

  return new Set(baseValues);
}

export function createSetProxy<T>(
  changeTracker: ChangeTracker,
  propPointer: string,
  schema: SetType<ValueType<any>, any>
): Set<T> {
  let set;
  if (schema.options.nullable && changeTracker.get(propPointer) === null) {
    set = new Set<T>();
  } else {
    const stringSet = getSetFromChangeTracker(changeTracker, propPointer);
    set = new Set(
      [...stringSet].map(
        (v) =>
          schema.items.convertDBValueToJS(
            // @ts-ignore
            v
          ) as T
      )
    );
  }

  const updateProxy = new SetUpdateProxy<T>(changeTracker, propPointer, schema);
  return new Proxy(set, {
    get(target, prop) {
      if (
        typeof (
          // @ts-ignore
          target[prop]
        ) === 'function'
      ) {
        return function (
          // @ts-ignore
          ...args
        ) {
          if (
            // @ts-ignore
            updateProxy[prop]
          ) {
            // @ts-ignore
            updateProxy[prop](...args);
          }

          const result =
            // @ts-ignore
            target[prop](...args);

          return result;
        };
      } else {
        return Reflect.get(target, prop);
      }
    },
  });
}

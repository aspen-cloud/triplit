import {
  InvalidSchemaOptionsError,
  InvalidSetTypeError,
  NotImplementedError,
  DBSerializationError,
} from '../errors.js';
import { TimestampType, ValueType } from './base.js';
import { CollectionInterface } from './collection.js';
import {
  CollectionAttributeDefinition,
  VALUE_TYPE_KEYS,
  ValueAttributeDefinition,
} from './serialization.js';
import { ExtractJSType } from './type.js';
import { ChangeTracker } from '../db-transaction.js';

const SET_OPERATORS = ['=', '!='] as const;
type SetOperators = typeof SET_OPERATORS;

export type SetType<Items extends ValueType<any>> = CollectionInterface<
  'set',
  Set<ExtractJSType<Items>>,
  Record<string, boolean>,
  Record<string, [boolean, TimestampType]>, // TODO: should be based on the type of the key
  SetOperators
>;

export function SetType<Items extends ValueType<any>>(
  items: Items
): SetType<Items> {
  if (!VALUE_TYPE_KEYS.includes(items.type))
    throw new InvalidSetTypeError(items.type);
  if (items.options?.nullable)
    throw new InvalidSchemaOptionsError('Set types cannot be nullable');
  return {
    type: 'set',
    items,
    supportedOperations: SET_OPERATORS,
    toJSON(): CollectionAttributeDefinition {
      return {
        type: this.type,
        items: this.items.toJSON() as ValueAttributeDefinition,
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
      return [...val.values()].reduce((acc, key) => {
        return { ...acc, [key as string]: true };
      }, {});
    },
    convertJSONToJS(val: any[]) {
      if (!Array.isArray(val)) throw new Error('Invalid JSON value for set');
      return new Set(val);
    },
    defaultInput() {
      return new Set();
    },
    convertDBValueToJS(val) {
      return new Set(
        Object.entries(val)
          .filter(([_k, v]) => !!v)
          .map(([k, _v]) => this.items.fromString(k) as ExtractJSType<Items>)
      );
    },
    convertJSToJSON(val) {
      if (!(val instanceof Set)) throw new Error('Invalid JS value for set');
      return [...val.values()];
    },
    validateInput(val: any) {
      // must be a set
      if (!(val instanceof Set)) return `Expected Set, got ${typeof val}`;
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

class SetUpdateProxy<T> {
  constructor(
    public changeTracker: ChangeTracker,
    private prefix: string,
    public schema: SetType<ValueType<any>>
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
  schema: SetType<ValueType<any>>
): Set<T> {
  const stringSet = getSetFromChangeTracker(changeTracker, propPointer);
  const set = new Set(
    [...stringSet].map(
      (v) =>
        schema.items.convertDBValueToJS(
          // @ts-ignore
          v
        ) as T
    )
  );
  const proxy = new SetUpdateProxy<T>(changeTracker, propPointer, schema);
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
            proxy[prop]
          ) {
            // @ts-ignore
            proxy[prop](...args);
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

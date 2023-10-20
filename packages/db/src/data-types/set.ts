import { ValuePointer } from '@sinclair/typebox/value';
import {
  InvalidSchemaOptionsError,
  InvalidSetTypeError,
  NotImplementedError,
} from '../errors.js';
import { TimestampType, ValueType } from './base.js';
import { CollectionInterface } from './collection.js';
import {
  CollectionAttributeDefinition,
  VALUE_TYPE_KEYS,
  ValueAttributeDefinition,
} from './serialization.js';
import { ExtractJSType } from './type.js';

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
    convertInputToJson(val: Set<any>) {
      return [...val.values()].reduce((acc, key) => {
        return { ...acc, [key as string]: true };
      }, {});
    },
    // @ts-ignore TODO fix during testing
    default() {
      return new Set(); // TODO: should return record
    },
    convertJsonValueToJS(val) {
      return new Set(
        Object.entries(val)
          .filter(([_k, v]) => !!v)
          .map(([k, _v]) => this.items.fromString(k) as ExtractJSType<Items>)
      );
    },
    validateInput(_val: any) {
      throw new NotImplementedError('Set validation');
    },
  };
}

// This is an abstraction around ValuePointer and the relevant pieces of info we need for updates
// I think it could be used for other complex types, and you'd this object for ensuring relevant changes are passed to the update
class ChangeTracker {
  constructor(
    public changes: Record<string, any>,
    public prefix: string,
    public value: any,
    public schema: any
  ) {}

  get(prop?: string) {
    if (!prop) return ValuePointer.Get(this.changes, this.prefix) ?? this.value;
    return (
      ValuePointer.Get(this.changes, [this.prefix, prop].join('/')) ??
      ValuePointer.Get(this.value, [prop].join('/'))
    );
  }

  set(prop: string, value: any) {
    ValuePointer.Set(this.changes, [this.prefix, prop].join('/'), value);
  }

  getChange(prop: string) {
    return ValuePointer.Get(this.changes, [this.prefix, prop].join('/'));
  }

  getChangedKeys() {
    const prefixObj = ValuePointer.Get(this.changes, this.prefix);
    return Object.keys(prefixObj ?? {});
  }
}

class SetUpdateProxy<T> {
  constructor(public changeTracker: ChangeTracker) {}
  add(value: T) {
    const serializedValue =
      this.changeTracker.schema.items.convertInputToJson(value);
    this.changeTracker.set(serializedValue, true);
  }
  clear(): void {
    const values = getSetFromChangeTracker(this.changeTracker);
    values.forEach((v) => {
      this.changeTracker.set(v, false);
    });
  }
  delete(value: T) {
    const serializedValue =
      this.changeTracker.schema.items.convertInputToJson(value);
    if (this.changeTracker.get(serializedValue)) {
      this.changeTracker.set(serializedValue, false);
    }
  }
}

function getSetFromChangeTracker(changeTracker: ChangeTracker) {
  const baseValues = Object.keys(changeTracker.value).filter(
    (k) => changeTracker.value[k]
  );

  const s = new Set(baseValues);
  for (const change of changeTracker.getChangedKeys()) {
    if (changeTracker.getChange(change)) {
      s.add(change);
    } else {
      s.delete(change);
    }
  }
  return s;
}

export function createSetProxy<T>(
  changes: any,
  propPointer: string,
  propValue: Record<string, boolean>,
  propSchema: SetType<ValueType<any>>
): Set<T> {
  const changeTracker = new ChangeTracker(
    changes,
    propPointer,
    propValue,
    propSchema
  );
  const stringSet = getSetFromChangeTracker(changeTracker);
  const set = new Set(
    [...stringSet].map(
      (v) => changeTracker.schema.items.convertJsonValueToJS(v) as T
    )
  );
  const proxy = new SetUpdateProxy<T>(changeTracker);
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

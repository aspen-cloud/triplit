import { DB, DBTransaction, Models } from '../../src/index.js';

export function fakeTx<M extends Models<M>>(db: DB<M>): DBTransaction<M> {
  return {} as DBTransaction<M>;
}

export type MapKey<M> = M extends Map<infer K, any> ? K : never;
export type MapValue<M> = M extends Map<any, infer V> ? V : never;

export type Extends<T, U> = T extends U ? true : false;

export type ExhaustiveSchemaSelectAll = {
  id: string;

  boolean: boolean;
  nullableBoolean?: boolean | null | undefined;
  optionalBoolean?: boolean | null | undefined;
  defaultBoolean: boolean;

  date: Date;
  nullableDate?: Date | null | undefined;
  optionalDate?: Date | null | undefined;
  defaultDate: Date;

  number: number;
  nullableNumber?: number | null | undefined;
  optionalNumber?: number | null | undefined;
  defaultNumber: number;

  record: {
    attr1: string;
    attr2: number;
    nullable?: string | null | undefined;
    optional?: string | null | undefined;
  };
  nullableRecord?:
    | {
        attr1: string;
        attr2: number;
      }
    | null
    | undefined;
  optionalRecord?:
    | {
        attr1: string;
        attr2: number;
      }
    | null
    | undefined;

  setBoolean: Set<boolean>;
  setDate: Set<Date>;
  setNumber: Set<number>;
  setString: Set<string>;
  nullableSet?: Set<string> | null | undefined;
  optionalSet?: Set<string> | null | undefined;

  string: string;
  nullableString?: string | null | undefined;
  optionalString?: string | null | undefined;
  defaultString: string;
  enumString: 'a' | 'b' | 'c';
  nullableEnumString?: 'a' | 'b' | 'c' | null | undefined;
};

export type ExhaustiveSchemaInsert = {
  id?: string | null | undefined;

  boolean: boolean;
  nullableBoolean?: boolean | null | undefined;
  optionalBoolean?: boolean | null | undefined;
  defaultBoolean?: boolean | null | undefined;

  date: Date | number | string;
  nullableDate?: Date | number | string | null | undefined;
  optionalDate?: Date | number | string | null | undefined;
  defaultDate?: Date | number | string | null | undefined;

  number: number;
  nullableNumber?: number | null | undefined;
  optionalNumber?: number | null | undefined;
  defaultNumber?: number | null | undefined;

  record: {
    attr1: string;
    attr2: number;
    nullable?: string | null | undefined;
    optional?: string | null | undefined;
  };
  nullableRecord?:
    | {
        attr1: string;
        attr2: number;
      }
    | null
    | undefined;
  optionalRecord?:
    | {
        attr1: string;
        attr2: number;
      }
    | null
    | undefined;

  setBoolean: Set<boolean> | boolean[];
  setDate: Set<Date | number | string> | (Date | number | string)[];
  setNumber: Set<number> | number[];
  setString: Set<string> | string[];
  nullableSet?: Set<string> | string[] | null | undefined;
  optionalSet?: Set<string> | string[] | null | undefined;

  string: string;
  nullableString?: string | null | undefined;
  optionalString?: string | null | undefined;
  defaultString?: string | null | undefined;
  enumString: 'a' | 'b' | 'c';
  nullableEnumString?: 'a' | 'b' | 'c' | null | undefined;
};

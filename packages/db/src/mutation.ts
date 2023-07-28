import {
  Attribute,
  EntityId,
  TripleStoreTransaction,
  Value,
} from './triple-store';
import * as RegisterCRDT from './crdt/register';
import * as SetCRDT from './crdt/set';
import { getSchemaFromPath, Model, RegisterType, SetType } from './schema';
import { Static } from '@sinclair/typebox';
import { InvalidMutationError } from './errors';

// A convenience wrapper for the data needed to perform a write
export interface MutationTransaction {
  transactor: TripleStoreTransaction;
  collection?: string;
  entity?: EntityId;
  attribute?: Attribute;
  data?: any;
}

export interface UpdateMutationTransaction extends MutationTransaction {
  entity: EntityId;
  attribute: Attribute;
}

type MutationAttribute<M extends Model<any> | undefined> = M extends Model<any>
  ? (keyof M['properties'])[]
  : M extends undefined
  ? string[]
  : never;

type PickFromObject<O, P extends any[]> = P extends [infer K, ...infer R]
  ? K extends keyof O
    ? R extends []
      ? O[K]
      : PickFromObject<O[K], R>
    : never
  : never;

type MutationTypeFromModel<
  M extends Model<any> | undefined,
  P extends MutationAttribute<M>
> = M extends Model<any>
  ? PickFromObject<M['static'], P> extends Static<RegisterType>
    ? MutationRegister
    : PickFromObject<M['static'], P> extends Static<SetType>
    ? MutationSet
    : never
  : M extends undefined
  ? MutationRegister
  : never;

export class Mutation<M extends Model<any> | undefined> {
  tx: MutationTransaction;
  schema?: M;

  constructor(tx: MutationTransaction, schema?: M) {
    this.tx = tx;
    this.schema = schema;
  }

  entity(entity: EntityId) {
    this.tx.entity = entity;
    return this;
  }

  attribute<Attr extends MutationAttribute<M>>(
    attribute: [...Attr]
  ): MutationTypeFromModel<M, Attr> {
    const fullAttribute = [this.tx.collection!, ...(attribute as string[])];
    this.tx.attribute = fullAttribute;

    if (!this.tx.entity)
      throw new InvalidMutationError(
        'There is no selected entity for this mutation. Use .entity() to select an entity.'
      );
    if (!this.tx.attribute?.length)
      throw new InvalidMutationError(
        'There is no selected attribute for this mutation. Use .attribute() to select an attribute. Ensure attribute is a non empty array.'
      );
    if (this.schema) {
      const pathSchema = getSchemaFromPath(this.schema, attribute as string[]);
      if (pathSchema['x-crdt-type'] === 'Register')
        // @ts-ignore
        return new MutationRegister(this.tx as UpdateMutationTransaction);
      if (pathSchema['x-crdt-type'] === 'Set')
        // @ts-ignore
        return new MutationSet(this.tx as UpdateMutationTransaction);
      throw new InvalidMutationError(
        `The type (${pathSchema['x-serialized-type']}) of this attribute (${attribute}) does not support updates.`
      );
    }
    // @ts-ignore
    return new MutationRegister(this.tx as UpdateMutationTransaction);
  }
}

class MutationRegister {
  private tx: UpdateMutationTransaction;
  constructor(tx: UpdateMutationTransaction) {
    this.tx = tx;
  }

  async set(value: Value) {
    return RegisterCRDT.set(this.tx, value);
  }
}

class MutationSet {
  private tx: UpdateMutationTransaction;
  constructor(tx: UpdateMutationTransaction) {
    this.tx = tx;
  }

  async add(value: Value) {
    return SetCRDT.add(this.tx, value);
  }

  async remove(value: Value) {
    return SetCRDT.remove(this.tx, value);
  }
}

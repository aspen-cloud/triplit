export type TupleValue = number | string | boolean | null;
export type EntityId = string;
export type AttributeItem = string | number;
export type Attribute = AttributeItem[];
export type Timestamp = [sequence: number, client: string];
export type Expired = boolean;
export type TripleRow = {
  id: EntityId;
  attribute: Attribute;
  value: TupleValue;
  timestamp: Timestamp;
  expired: Expired;
};

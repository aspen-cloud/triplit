// @ts-nocheck
import { DataType } from './base';
import { Schema as S } from '../schema';
import { Attribute } from '../triple-store';

// Something weird is going on here?
// Possibly a circular reference? Sometimes S is undefined
const SetStructure = S.Set;

const SetType: DataType<Set<any>, ReturnType<typeof SetStructure>> = {
  fromJSON(val: Set<string>) {
    // NOTE: Previously this returned an object from entries, but that loses some information as all keys are converted to strings
    // This caused query issues down the line when queries expecting numbers were searching over strings and failing

    return new Map(Array.from(val).map((item) => [item, true]));
  },
  toJSON() {
    throw new Error('Function not implemented.');
  },
  internalStructure: () => SetStructure,
  operations: {
    add: (value: any) => {
      const attributeValuePairs = [[[value], true] as [Attribute, boolean]];
      return attributeValuePairs;
    },
    remove: (value: any) => {
      const attributeValuePairs = [[[value], false] as [Attribute, boolean]];
      return attributeValuePairs;
    },
  },
};

export default SetType;

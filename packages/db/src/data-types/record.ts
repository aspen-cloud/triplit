import { DataType } from './base';
import { RecordAttributeDefinition } from './serialization';
import { ExtractDeserializedType, TypeInterface } from './type';

// type RecordTypeboxType = TObject<{
//   [k: string]: ReturnType<DataType['toTypebox']> | RecordTypeboxType;
// }>;

// prevents circular reference using return type
// TODO: pull methods out to base type
// TODO: fixup types for serialization
export type RecordType<Properties extends Record<string, DataType>> =
  TypeInterface<
    'record',
    { [k in keyof Properties]: ExtractDeserializedType<Properties[k]> }, // TODO: dont use any
    any,
    any,
    readonly []
  > & {
    properties: Record<string, DataType>;
  };

export function RecordType<Properties extends Record<string, DataType>>(
  properties: Properties
): RecordType<Properties> {
  return {
    type: 'record' as const,
    supportedOperations: [] as const, // 'hasKey', etc
    properties,
    // toTypebox(): RecordTypeboxType {
    //   const schema = Object.fromEntries(
    //     Object.entries(properties).map(([key, val]) => [key, val.toTypebox()])
    //   );
    //   return Type.Object(schema, {
    //     'x-serialized-type': { type: 'record' },
    //   });
    // },
    toJSON(): RecordAttributeDefinition {
      const serializedProps = Object.fromEntries(
        Object.entries(properties).map(([key, val]) => [key, val.toJSON()])
      );
      return { type: this.type, properties: serializedProps };
    },
    serialize(val: any) {
      return val;
    },
    deserialize(val: any) {
      return val;
    },
    default() {
      return undefined;
    },
    validate(_val: any) {
      return true; // TODO
    },
    deserializeCRDT(val) {
      return Object.fromEntries(
        Object.entries(val).map(([k, v]) => [
          k,
          properties[k].deserializeCRDT(v),
        ])
      );
    },
  };
}

// export class RecordType {
//   readonly type = 'record';
//   readonly supportedOperations = [] as const; // 'hasKey', etc

//   constructor(public readonly properties: Record<string, DataType>) {}

//   toTypebox(): RecordTypeboxType {
//     const schema = Object.fromEntries(
//       Object.entries(this.properties).map(([key, val]) => [
//         key,
//         val.toTypebox(),
//       ])
//     );
//     return Type.Object(schema, {
//       'x-serialized-type': { type: 'record' },
//     });
//   }

//   toJSON(): RecordAttributeDefinition {
//     const serializedProps = Object.fromEntries(
//       Object.entries(this.properties).map(([key, val]) => [key, val.toJSON()])
//     );
//     return { type: this.type, properties: serializedProps };
//   }

//   serialize(val: any) {
//     return val;
//   }
//   deserialize(val: any) {
//     return val;
//   }
//   default() {
//     return undefined;
//   }
// }

import { Model } from '../schema';
import { Attribute, Value } from '../triple-store';
export interface DataType<Json, InternalModel extends Model<any>> {
  fromJSON: (val: Json) => InternalModel;
  toJSON: (internals: InternalModel) => Json;
  internalStructure: () => InternalModel;
  operations: Record<string, (params: any) => [Attribute, Value][]>;
}

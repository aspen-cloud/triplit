import { Value as TBValue } from '@sinclair/typebox/value';
import { UserTypeOptions } from './types/index.js';
import { Static, Type } from '@sinclair/typebox';
import { nanoid } from 'nanoid';

export function userTypeOptionsAreValid(options: UserTypeOptions) {
  return TBValue.Check(UserTypeOptionsSchema, options);
}

const DefaultFunctionSchema = Type.Object({
  func: Type.String(),
  args: Type.Optional(Type.Union([Type.Array(Type.Any()), Type.Null()])),
});

export type DefaultFunctionType = Static<typeof DefaultFunctionSchema>;

export const UserTypeOptionsSchema = Type.Object({
  nullable: Type.Optional(Type.Boolean()),
  default: Type.Optional(
    Type.Union([
      Type.String(),
      Type.Number(),
      Type.Boolean(),
      Type.Null(),
      DefaultFunctionSchema,
    ])
  ),
});

// NOTE: default values must be serializable
export function calcDefaultValue(options: UserTypeOptions) {
  let attributeDefault = options.default;
  if (attributeDefault === undefined) {
    // no default object
    return undefined;
  }
  if (typeof attributeDefault !== 'object' || attributeDefault === null)
    return attributeDefault;
  else {
    const { args, func } = attributeDefault;
    if (func === 'uuid') {
      return args && typeof args[0] === 'number' ? nanoid(args[0]) : nanoid();
    } else if (func === 'now') {
      return new Date().toISOString();
    }
  }
  return undefined;
}

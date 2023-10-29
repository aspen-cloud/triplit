import { ReactElement } from 'react';
import { Flag, FlagsToTypes } from './flags.js';
import { Middleware, MiddlewareDefinition } from './middleware.js';

type MiddlewareArgs<M> = M extends CommandDefinition<infer A, any, any>
  ? A
  : never;
type UnionOfMiddlewareArgs<M extends any[]> = M[number] extends never
  ? never
  : MiddlewareArgs<M[number]>;

type UnionOfMiddlewareFlags<M extends MiddlewareDefinition<any, any, any>[]> =
  M[number] extends never ? never : M[number]['flags'];

type UnionOfMiddlewareCtx<M extends MiddlewareDefinition<any, any, any>[]> =
  M[number] extends MiddlewareDefinition<any, any, infer Ctx> ? Ctx : never;

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never;

type ArgDefinition = {
  name: string;
  description: string;
  required?: boolean;
};
// Having only a single arg definition is equivalent to having [...args];
export type ArgDefinitions = ArgDefinition[] | ArgDefinition;

type ArgDefinitionsToValues<Args extends ArgDefinitions> = Args extends {
  name: infer Name;
  description: string;
}
  ? {
      [K in Name as string]: string[];
    }
  : Args extends { name: infer Name extends string; description: string }[]
  ? {
      // Creates record of arg names to a single string value
      [key in Name]: string;
    }
  : never;

export interface CommandDefinition<
  Args extends ArgDefinitions | undefined,
  Flags extends { [key: string]: Flag } | undefined,
  Middleware extends MiddlewareDefinition<any, any, any>[] = []
> {
  description?: string;
  examples?: { usage: string; description?: string }[];
  args?: Args;
  flags?: Flags;
  middleware?: Middleware;
  run: RunCommand<Args, Flags, Middleware>;
}

type RunCommand<
  Args extends ArgDefinitions | undefined,
  Flags extends Record<string, any>,
  Middleware extends MiddlewareDefinition<any, any, any>[]
> = (params: {
  args: ArgDefinitionsToValues<
    Args & UnionToIntersection<UnionOfMiddlewareArgs<Middleware>>
  >;
  flags: FlagsToTypes<
    Flags & UnionToIntersection<UnionOfMiddlewareFlags<Middleware>>
  >;
  ctx: UnionToIntersection<UnionOfMiddlewareCtx<Middleware>>;
}) => Promise<ReactElement> | ReactElement | Promise<void> | void;

export function Command<
  Args extends ArgDefinitions,
  Flags extends Record<string, Flag> = Record<string, Flag>,
  M extends MiddlewareDefinition<any, any, any>[] = []
>(def: CommandDefinition<Args, Flags, M>): CommandDefinition<Args, Flags, M> {
  return def;
}

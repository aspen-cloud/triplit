import { ReactElement } from 'react';
import { Flag, FlagsToTypes } from './flags.js';
import { Middleware, MiddlewareDefinition } from './middleware.js';

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
  Flags extends AllowedFlags<Middleware>,
  Middleware extends MiddlewareDefinition<any, any, any, any> | undefined,
> {
  description?: string;
  examples?: { usage: string; description?: string }[];
  args?: Args;
  flags?: Flags;
  middleware?: Middleware[];
  preRelease?: boolean;
  run: RunCommand<Args, Flags, Middleware>;
}

type MergeUnion<U> = {
  [K in U extends any ? keyof U : never]: U extends Record<K, infer T>
    ? T
    : never;
};

type RunCommand<
  Args extends ArgDefinitions | undefined,
  Flags extends AllowedFlags<Middleware> | undefined,
  Middleware extends MiddlewareDefinition<any, any, any, any>,
> = (params: {
  args: ArgDefinitionsToValues<Args & ArgsFromMiddleware<Middleware>>;
  flags: FlagsToTypes<Flags & FlagsFromMiddleware<Middleware>>;
  ctx: MergeUnion<CtxFromMiddleware<Middleware>>;
}) => Promise<ReactElement> | ReactElement | Promise<void> | void;

export function Command<
  Args extends ArgDefinitions,
  Flags extends AllowedFlags<Middleware>,
  Middleware extends MiddlewareDefinition<any, any, any, any>,
>(
  def: CommandDefinition<Args, Flags, Middleware>
): CommandDefinition<Args, Flags, Middleware> {
  return def;
}

// This type helps handle when Middleware flags aren't defined. Otherwise, you can end
// up with a type that's like {[k: any]: never} which we don't want
type AllowedFlags<Middleware extends MiddlewareDefinition<any, any, any, any>> =
  keyof FlagsFromMiddleware<Middleware> extends string
    ? string extends keyof FlagsFromMiddleware<Middleware>
      ? { [K: string]: Flag<any> }
      : { [K: string]: Flag<any> } & Partial<{
          [K in keyof FlagsFromMiddleware<Middleware>]: 'USED BY MIDDLEWARE';
        }>
    : { [K: string]: Flag<any> };

type FlagsFromMiddleware<M extends MiddlewareDefinition<any, any, any, any>> =
  M extends MiddlewareDefinition<any, infer MFlags, any, any> ? MFlags : never;

type ArgsFromMiddleware<M extends MiddlewareDefinition<any, any, any, any>> =
  M extends MiddlewareDefinition<infer Args, any, any, any> ? Args : never;

type CtxFromMiddleware<M extends MiddlewareDefinition<any, any, any, any>> =
  M extends MiddlewareDefinition<any, any, any, infer Run>
    ? Exclude<Awaited<ReturnType<Run>>, string>
    : never;

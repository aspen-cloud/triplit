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

export interface CommandDefinition<
  Args extends any[],
  Flags extends { [key: string]: Flag } | undefined,
  Middleware extends MiddlewareDefinition<any, any, any>[] = []
> {
  description?: string;
  args?: Args;
  flags?: Flags;
  middleware?: Middleware;
  run: RunCommand<Args, Flags, Middleware>;
}

type ArgsDefinitionToValues<Args extends string[]> = any[];

type RunCommand<
  Args extends any[],
  Flags extends Record<string, any>,
  Middleware extends MiddlewareDefinition<any, any, any>[]
> = (params: {
  args: ArgsDefinitionToValues<
    Args & UnionToIntersection<UnionOfMiddlewareArgs<Middleware>>
  >;
  flags: FlagsToTypes<
    Flags & UnionToIntersection<UnionOfMiddlewareFlags<Middleware>>
  >;
  ctx: UnionToIntersection<UnionOfMiddlewareCtx<Middleware>>;
}) => Promise<ReactElement> | ReactElement | Promise<void> | void;

export function Command<
  Args extends string[] = string[],
  Flags extends Record<string, Flag> = Record<string, Flag>,
  M extends MiddlewareDefinition<any, any, any>[] = []
>(def: CommandDefinition<Args, Flags, M>): CommandDefinition<Args, Flags, M> {
  return def;
}

// const myMiddleware = Middleware({
//   name: 'my-command',
//   description: 'My command',
//   args: ['arg1', 'arg2'],
//   flags: {
//     isDev: {
//       type: 'boolean',
//       description: 'Flag 1',
//     },
//   },
//   run: async ({ args, flags }) => {
//     return {
//       secret: flags.isDev ? 'test' : 'prod',
//     };
//   },
// });

// const myMiddleware2 = Middleware({
//   name: 'my-command',
//   description: 'My command',
//   args: ['arg1', 'arg2'],
//   flags: {
//     domain: {
//       type: 'string',
//       description: 'Flag 1',
//     },
//   },
//   run: async ({ args, flags }) => {
//     return {
//       url: `https://${flags.domain}`,
//     };
//   },
// });

// const myCommand = Command({
//   name: 'my-middleware',
//   description: 'My middleware',
//   flags: {
//     flag2: {
//       type: 'string',
//       description: 'Flag 2',
//     },
//   },
//   middleware: [myMiddleware, myMiddleware2],
//   run: async ({ args, flags, ctx }) => {
//     flags.isDev;
//     flags.flag2;
//     console.log('Running my middleware');
//   },
// });

// type MyCommand = typeof myCommand;
// type MyMiddlwareCtx = UnionOfMiddlewareCtx<MyCommand['middleware']>;

// type MyFlags = typeof myCommand extends CommandDefinition<any, any, any>
//   ? (typeof myCommand)['flags']
//   : never;
// type MyFlag = MyFlags['flag2'];

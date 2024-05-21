import { Flag, FlagsToTypes } from './flags.js';

/**
 *
 * @param def
 * @returns Either a context object to merge into the current context, or a string to print to the console as an error messages.
 */
export function Middleware<
  Ctx extends Record<string, any>,
  Run extends (params: {
    flags: FlagsToTypes<Flags>;
    args: Args;
  }) => Ctx | Promise<Ctx> | string | Promise<string>,
  Args extends string[] = string[],
  Flags extends Record<string, Flag> = Record<string, Flag>
>(
  def: MiddlewareDefinition<Args, Flags, Ctx, Run>
): MiddlewareDefinition<Args, Flags, Ctx, Run> {
  return def;
}

export interface MiddlewareDefinition<
  Args extends string[],
  Flags extends { [key: string]: Flag } | undefined,
  Ctx extends Record<string, any>,
  Run extends (params: {
    flags: FlagsToTypes<Flags>;
    args: Args;
  }) => Ctx | Promise<Ctx> | string | Promise<string>
> {
  name: string;
  description?: string;
  args?: Args;
  flags?: Flags;
  run: Run;
}

export interface Flag<T = any> {
  description?: string;
  required?: boolean;
  char?: string;
  parse: (input: string | number | boolean) => T;
  default?: T;
  hidden?: boolean;
}

export type FlagsToTypes<F extends Record<string, Flag>> = {
  [K in keyof F]: FlagDefinitionToType<F[K]>;
};

type FlagDefinitionToType<F extends Flag> = F extends Flag<infer T> ? T : never;

type BuiltInFlagOpts = Omit<Flag, 'parse'>;

export function Boolean(opts: BuiltInFlagOpts): Flag<boolean> {
  return {
    ...opts,
    parse: (input) => input === true || input === 'true' || input === '1',
  };
}

export function String(opts: BuiltInFlagOpts): Flag<string> {
  return {
    ...opts,
    parse: (input) => {
      if (input === true) return '';
      return input.toString();
    },
  };
}

export function Number(opts: BuiltInFlagOpts): Flag<number> {
  return {
    ...opts,
    parse: (input) => {
      if (typeof input === 'number') return input;
      if (typeof input === 'string') {
        let maybeNum = parseFloat(input);
        if (!isNaN(maybeNum)) {
          return maybeNum;
        }
      }
      throw new Error(`Expected a number but received: ${input}`);
    },
  };
}

export function Enum<E extends Readonly<string[]>>(
  opts: BuiltInFlagOpts & { options: E }
): Flag<E[number]> {
  return {
    ...opts,
    parse: (input: string) => {
      if (!opts.options.includes(input)) {
        throw new Error(
          `Invalid option: "${input}". Valid options are: ${opts.options.join(
            ', '
          )}`
        );
      }
      return input;
    },
  };
}

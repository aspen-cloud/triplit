// An interface that represents the shape of the flags object that mimics Ocliff flags
type FlagTypes = 'string' | 'boolean' | 'number' | 'integer' | 'file';

export interface Flag {
  description?: string;
  required?: boolean;
  char?: string;
  type?: FlagTypes;
}

export type FlagsToTypes<F extends Record<string, Flag>> = {
  [K in keyof F]: FlagDefinitionToType<F[K]>;
};

type FlagDefinitionToType<F extends Flag> = F['type'] extends 'string'
  ? string
  : F['type'] extends 'boolean'
  ? boolean
  : F['type'] extends 'number'
  ? number
  : F['type'] extends 'integer'
  ? number
  : F['type'] extends 'file'
  ? string
  : never;

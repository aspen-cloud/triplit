// An interface that represents the shape of the flags object that mimics Ocliff flags
type FlagTypes = 'string' | 'boolean' | 'number' | 'integer' | 'file';

export interface Flag {
  description?: string;
  required?: boolean;
  char?: string;
  type?: FlagTypes;
}

const NumberFlag = (flag: Flag) => {};

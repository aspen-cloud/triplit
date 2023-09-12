import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ReactElement } from 'react';
import { Flag } from './flags';

export interface CommandDefinition {
  name: string;
  description?: string;
  args?: string[];
  flags?: string[];
  run: (
    args: string[],
    flags: {}
  ) => Promise<ReactElement> | ReactElement | Promise<void> | void;
}

export type CommandInfo = {
  name: string;
  sourcePath: string;
};

export type CommandTree = { [key: string]: CommandTree | CommandInfo };

export async function getCommandsWithDefinition(
  commands: CommandTree,
  prefix: string[]
): Promise<CommandDefinition[]> {
  return Promise.all(
    Object.entries(commands).flatMap(async ([name, cmd]) => {
      if (isCommandInfo(cmd)) {
        return [await getCommandDefinition(cmd, prefix)];
      }
      return await getCommandsWithDefinition(cmd, prefix.concat(name));
    })
  ).then((results) =>
    results.flat().filter((cmd) => cmd.description)
  ) as Promise<CommandDefinition[]>;
}

export function isCommandInfo(obj: {}): obj is CommandInfo {
  return typeof obj === 'object' && 'sourcePath' in obj;
}

export async function getCommandDefinition(
  cmd: CommandInfo,
  prefix: string[] = []
): Promise<CommandDefinition> {
  const { name, sourcePath } = cmd;
  const { description, args, flags, run } = (await import(
    sourcePath
  )) as CommandDefinition;
  return { name: prefix.concat(name).join(' '), description, args, flags, run };
}

// Recursively find all ts and tsx files in the commands directory
export function findCommands(dir: string): CommandTree {
  const files = readdirSync(dir);
  const tsFiles = files.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
  const dirs = files.filter((f) => !tsFiles.includes(f));
  const commands: CommandTree = {};
  tsFiles.forEach((fileName) => {
    const name = fileName.replace(/\.tsx?$/, '');
    commands[name] = { name, sourcePath: join(dir, fileName) };
  });
  dirs.forEach((dirName) => {
    commands[dirName] = findCommands(dir + '/' + dirName);
  });
  return commands;
}

export type Command<
  Flags extends Flag[] | undefined,
  Args extends any | undefined
> = {
  description?: string;
  flags: Flags;
  args?: Args;
  (args: Args, flags: Flags):
    | Promise<ReactElement>
    | ReactElement
    | Promise<void>
    | void;
};

const MyCommand = () => {};

MyCommand.flags = [] as Flag[];

console.log(MyCommand);

MyCommand satisfies Command<typeof MyCommand.flags, undefined>;

// MyCommands.flags = [{}];

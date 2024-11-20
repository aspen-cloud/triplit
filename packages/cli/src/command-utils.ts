import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ReactElement } from 'react';
import { Flag } from './flags.js';
import { CommandDefinition } from './command.js';

export type CommandInfo = {
  name: string;
  sourcePath: string;
};

export type CommandTree = { [key: string]: CommandTree | CommandInfo };

export async function getCommandsWithDefinition(
  commands: CommandTree,
  prefix: string[]
): Promise<(CommandDefinition<any, any, any> & { name: string })[]> {
  return Promise.all(
    Object.entries(commands).flatMap(async ([name, cmd]) => {
      if (isCommandInfo(cmd)) {
        return [await getCommandDefinition(cmd, prefix)];
      }
      return await getCommandsWithDefinition(cmd, prefix.concat(name));
    })
  ).then((results) =>
    results.flat().filter((cmd) => cmd.description)
  ) as Promise<(CommandDefinition<any, any, any> & { name: string })[]>;
}

export function isCommandInfo(obj: {}): obj is CommandInfo {
  return typeof obj === 'object' && 'sourcePath' in obj;
}

export async function getCommandDefinition(
  cmd: CommandInfo,
  prefix: string[] = []
): Promise<CommandDefinition<any, any, any> & { name: string }> {
  const { name, sourcePath } = cmd;
  const { default: definition } = (await import('file:///' + sourcePath)) as {
    default: CommandDefinition<any, any, any>;
  };
  return { name: prefix.concat(name).join(' '), ...definition };
}

// Recursively find all ts and tsx files in the commands directory
export function findCommands(dir: string): CommandTree {
  const files = readdirSync(dir);
  const tsFiles = files.filter(
    (f) =>
      f.endsWith('.ts') ||
      f.endsWith('.tsx') ||
      f.endsWith('.js') ||
      f.endsWith('.jsx')
  );
  const dirs = files.filter((f) => !tsFiles.includes(f));
  const commands: CommandTree = {};
  tsFiles.forEach((fileName) => {
    const name = fileName.replace(/\.(tsx?|jsx?)$/, '');
    commands[name] = { name, sourcePath: join(dir, fileName) };
  });
  dirs.forEach((dirName) => {
    commands[dirName] = findCommands(dir + '/' + dirName);
  });
  return commands;
}

export type Command<
  Flags extends Flag[] | undefined,
  Args extends any | undefined,
> = {
  description?: string;
  flags: Flags;
  args?: Args;
  (
    args: Args,
    flags: Flags
  ): Promise<ReactElement> | ReactElement | Promise<void> | void;
};

const MyCommand = () => {};

MyCommand.flags = [] as Flag[];

MyCommand satisfies Command<typeof MyCommand.flags, undefined>;

// MyCommands.flags = [{}];

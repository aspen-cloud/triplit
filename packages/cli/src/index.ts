#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import {
  bgGreenBright,
  bold,
  dim,
  green,
  inverse,
  italic,
  red,
  white,
  whiteBright,
} from 'ansis/colors';
import React from 'react';
import { render } from 'ink';
import {
  findCommands,
  CommandTree,
  CommandInfo,
  isCommandInfo,
  getCommandDefinition,
  getCommandsWithDefinition,
} from './command-utils.js';
import minimist from 'minimist';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import fetch from 'node-fetch';
import { Flag } from './flags.js';
import { CommandDefinition } from './command.js';
// @ts-ignore
global.WebSocket = WebSocket;
// @ts-ignore
global.fetch = fetch;

const argv = minimist(process.argv.slice(2), { stopEarly: false });

const { _: args, ...flags } = argv;

await execute(args, flags);

async function execute(args: string[], flags: {}) {
  const commands = findCommands(
    fileURLToPath(new URL('.', import.meta.url)) + '/commands'
  );

  let command: CommandTree | CommandInfo = commands;

  let i: number;
  for (i = 0; i < argv._.length; i++) {
    const part: string = argv._[i];
    if (isCommandInfo(command) || !command[part]) {
      break;
    }
    command = command[part];
  }

  const commandArgs = args.slice(i);

  if (!isCommandInfo(command)) {
    if (commandArgs.length > 0) {
      console.error('Could not find command: ' + args.join(' '));
    }

    await printDirectoryHelp(
      i === 0 ? 'triplit' : args.slice(0, i).join(' '),
      command
    );
    return;
  }
  const cmdDef = await getCommandDefinition(command);
  // @ts-ignore
  if (flags.help || flags.h) {
    printCommandHelp(cmdDef.name, cmdDef);
    return;
  }

  let unaliasedFlags = flags;

  if (cmdDef.flags) {
    const cmdFlagsDefs = Object.entries(
      (cmdDef.flags as Record<string, Flag>) ?? {}
    );
    unaliasedFlags = Object.entries(flags).reduce(
      (acc, [flagName, flagInput]) => {
        const flagDef = cmdFlagsDefs.find(
          ([name, { char }]) => name === flagName || char === flagName
        );
        if (flagDef) {
          const [name, def] = flagDef;
          try {
            acc[name] = def.parse(flagInput as string | boolean | number);
          } catch (e) {
            console.error(
              // @ts-ignore
              red`Could not interpret input for flag ${bold(name)}`
            );
            console.error(`   ${e.message}`);
            process.exit(1);
          }
        } else {
          acc[flagName] = flagInput;
        }
        return acc;
      },
      {}
    );
  }
  let ctx = {};
  for (const middleware of cmdDef.middleware ?? []) {
    const result = await middleware.run({
      flags: unaliasedFlags,
      args: commandArgs,
      ctx,
    });
    if (result) {
      ctx = { ...ctx, ...result };
    }
  }

  const result = await cmdDef.run({
    flags: unaliasedFlags,
    args: commandArgs,
    ctx,
  });
  if (result && React.isValidElement(result)) {
    render(result, { patchConsole: false });
  }
}

async function printDirectoryHelp(name: string, commands: CommandTree) {
  console.log(`Available commands for ${bold(name)}`);
  const commandDefs = await getCommandsWithDefinition(commands, []);
  console.log(
    commandDefs
      .map((cmd) => `  ${bold(cmd.name)} - ${cmd.description}`)
      .join('\n')
  );
}

function printCommandHelp<Cmd extends CommandDefinition<any, any, any>>(
  name: string,
  cmdDef: Cmd
) {
  // @ts-ignore
  console.log(`triplit ${bold(name)}`);
  console.log(dim(cmdDef.description));
  console.log();
  if (cmdDef.args?.length) {
    console.log('Arguments:');
    for (const arg of cmdDef.args) {
      console.log(`  ${bold(arg.name)} - ${arg.description}`);
    }
    console.log();
  }
  console.log('Flags:');
  if (cmdDef.flags) {
    printFlags(cmdDef.flags);
  }
  if (cmdDef.middleware?.length) {
    for (const middleware of cmdDef.middleware) {
      printFlags(middleware.flags ?? {});
    }
    console.log();
  }
  if (cmdDef.examples?.length) {
    console.log('Examples:');
    for (const example of cmdDef.examples) {
      console.log(`  ${bold(example.usage)} - ${example.description}`);
    }
    console.log();
  }
}

function printFlags(flags: Record<string, Flag>) {
  for (const [name, flag] of Object.entries(flags)) {
    console.log(`  ${bold(name)} - ${flag.description}`);
  }
}

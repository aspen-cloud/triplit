#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import { bold } from 'ansis/colors';
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

    await printHelp(i === 0 ? 'triplit' : args.slice(0, i).join(' '), command);
    return;
  }
  const cmdDef = await getCommandDefinition(command);
  const cmdFlagsDefs = Object.entries(cmdDef.flags ?? {});

  const unaliasedFlags = Object.entries(flags).reduce(
    (acc, [flagName, flagValue]) => {
      const flagDef = cmdFlagsDefs.find(
        ([name, { char }]) => name === flagName || char === flagName
      );
      if (flagDef) {
        const [name, def] = flagDef;
        acc[name] = flagValue;
      } else {
        acc[flagName] = flagValue;
      }
      return acc;
    },
    {}
  );

  const result = await cmdDef.run({
    flags: unaliasedFlags,
    args: commandArgs,
    ctx: {},
  });
  if (result && React.isValidElement(result)) {
    render(result, { patchConsole: false });
  }
}

async function printHelp(name: string, commands: CommandTree) {
  console.log(`Available commands for ${bold(name)}`);
  const commandDefs = await getCommandsWithDefinition(commands, []);
  console.log(
    commandDefs
      .map((cmd) => `  ${bold(cmd.name)} - ${cmd.description}`)
      .join('\n')
  );
}

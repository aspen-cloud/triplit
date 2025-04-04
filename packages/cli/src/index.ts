#!/usr/bin/env node
import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
dotenvExpand.expand(dotenv.config({ path: ['.env.local', '.env'] }));
import { bold, dim, red, yellow } from 'ansis/colors';
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
import { ArgDefinitions, CommandDefinition } from './command.js';
import { PostHog } from 'posthog-node';
import { readFileSync } from 'node:fs';
import * as Path from 'node:path';
import { getInstallId, getTelemetryEnabled } from './config.js';

// @ts-ignore
global.WebSocket = WebSocket;
// @ts-ignore
global.fetch = fetch;

// reads the package.json file and gets the version
const cliVersion = JSON.parse(
  readFileSync(
    Path.resolve(fileURLToPath(import.meta.url), '../../package.json'),
    'utf-8'
  )
).version;

const posthog = new PostHog('phc_wqlg7bicph69twhGZbS7vPW5V73UoWWz0pppf24x6WN', {
  host: 'https://us.i.posthog.com',
});

const isInteractiveSession = process.stdout.isTTY && process.stdin.isTTY;

// Heuristic to determine if the CLI is being used by a person rather than in CI/CD
const isBeingUsedByHuman = isInteractiveSession;

if (!getTelemetryEnabled() || !isBeingUsedByHuman) {
  await posthog.disable();
}

let installId = getInstallId();

posthog.identify({
  distinctId: installId,
  properties: {
    cliVersion,
  },
});

const argv = minimist(process.argv.slice(2), { stopEarly: false });

const { _: args, ...flags } = argv;

await execute(args, flags);

export async function execute(args: string[], flags: Record<string, any>) {
  const commands = findCommands(
    fileURLToPath(new URL('.', import.meta.url)) + '/commands'
  );

  let command: CommandTree | CommandInfo = commands;

  let fullCmdPath: string[] = [];
  let i: number;
  for (i = 0; i < argv._.length; i++) {
    const part: string = argv._[i];
    if (isCommandInfo(command) || !command[part]) {
      break;
    }
    fullCmdPath.push(part);
    command = command[part];
  }

  const commandArgs = args.slice(i);

  if (!isCommandInfo(command)) {
    if (commandArgs.length > 0) {
      console.error(red('Could not find command: ' + args.join(' ')));
    }

    await printDirectoryHelp(
      i === 0 ? 'triplit' : args.slice(0, i).join(' '),
      command
    );
    return;
  }
  const cmdDef = await getCommandDefinition(command);
  if (cmdDef.preRelease && !process.env.ENABLE_PRE_RELEASE) {
    console.error(`Could not find command: ${bold(cmdDef.name)}.`);
    return;
  }

  if (cmdDef.experimental) {
    console.log(
      yellow(
        `Warning: ${bold(
          cmdDef.name
        )} is experimental. It's behavior and usage may change in the future.`
      )
    );
  }

  // @ts-ignore
  if (flags.help || flags.h) {
    printCommandHelp(argv._.join(' '), cmdDef);
    return;
  }

  let unaliasedFlags = flags;

  let cmdFlagsDefs = Object.entries(
    (cmdDef?.flags as Record<string, Flag>) ?? {}
  );

  const middlewareFlagDefs = Object.entries(
    cmdDef?.middleware?.reduce(
      (acc, m) => ({ ...acc, ...(m?.flags ?? {}) }),
      {}
    ) ?? []
  ) as [string, Flag][];
  cmdFlagsDefs = [...cmdFlagsDefs, ...middlewareFlagDefs];
  if (cmdFlagsDefs.length > 0) {
    // Apply defaults to flags if one is provided and the flag is not already set
    const flagsWithDefaults = cmdFlagsDefs.reduce(
      (flags, [flagName, flagInput]) => {
        if (
          'default' in flagInput &&
          !(flagName in flags) &&
          !(flagInput.char && flagInput.char in flags)
        ) {
          flags[flagName] = flagInput.default;
        }
        return flags;
      },
      flags
    );
    unaliasedFlags = Object.entries(flagsWithDefaults).reduce<
      Record<string, any>
    >((acc, [flagName, flagInput]) => {
      const flagDef = cmdFlagsDefs.find(
        ([name, { char }]) => name === flagName || char === flagName
      );
      if (flagDef) {
        const [name, def] = flagDef;
        try {
          acc[name] = def.parse(flagInput as string | boolean | number);
        } catch (e: any) {
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
    }, {});
  }
  let ctx = {};
  for (const middleware of cmdDef.middleware ?? []) {
    const result = await middleware.run({
      flags: unaliasedFlags,
      args: commandArgs,
      ctx,
    });
    if (typeof result === 'string') {
      console.error(red(result));
      process.exit(1);
    }
    if (result) {
      ctx = { ...ctx, ...result };
    }
  }

  let parsedCommandArgs = {};

  if (cmdDef.args) {
    if (cmdDef.args instanceof Array) {
      parsedCommandArgs = cmdDef.args?.reduce((acc, arg, i) => {
        acc[arg.name] = commandArgs[i];
        return acc;
      }, {});
    } else {
      const { name, description } = cmdDef.args;
      parsedCommandArgs = {
        [name]: commandArgs,
      };
    }
  } else {
    parsedCommandArgs = commandArgs;
  }
  const cmdFullName = fullCmdPath.join(':');
  posthog.capture({
    distinctId: installId,
    event: 'cli_command_run',
    properties: {
      command: cmdFullName ?? cmdDef.name,
      flags: unaliasedFlags,
      args: parsedCommandArgs,
    },
  });
  try {
    const result = await cmdDef.run({
      flags: unaliasedFlags,
      args: parsedCommandArgs,
      ctx,
    });
    if (result && React.isValidElement(result)) {
      render(result, { patchConsole: false, exitOnCtrlC: false });
    }
  } catch (e: any) {
    console.error(red(e.message));
    // TODO report error
    process.exit(1);
  } finally {
    await posthog.shutdown();
  }
}

async function printDirectoryHelp(name: string, commands: CommandTree) {
  console.log(`Available commands for ${bold(name)}`);
  let commandDefs = await getCommandsWithDefinition(commands, []);
  if (!process.env.ENABLE_PRE_RELEASE) {
    commandDefs = commandDefs.filter((cmd) => !cmd.preRelease);
  }
  console.log(
    commandDefs
      .map((cmd) => `  ${bold(cmd.name)} - ${cmd.description}`)
      .join('\n')
  );
}

function printCommandHelp<
  Cmd extends CommandDefinition<ArgDefinitions, any, any>,
>(name: string, cmdDef: Cmd) {
  // @ts-ignore
  console.log(`triplit ${bold(name)}`);
  if (cmdDef.description) console.log(dim(cmdDef.description));
  console.log();
  if (cmdDef.args) {
    console.log('Arguments:');
    if (cmdDef.args instanceof Array) {
      for (let i = 0; i < cmdDef.args.length; i++) {
        const arg = cmdDef.args[i];
        console.log(
          // @ts-ignore
          `${dim`${i.toString()}:`} ${bold(arg.name)} ${dim(arg.description)}`
        );
      }
    } else {
      const { name, description } = cmdDef.args;
      console.log(`...${bold(name)} ${dim(description)}`);
    }
    console.log();
  }
  let hasPrintFlagHeader = false;
  if (cmdDef.flags) {
    console.log('Flags:');
    hasPrintFlagHeader = true;
    printFlags(cmdDef.flags);
  }
  if (cmdDef.middleware?.length) {
    for (const middleware of cmdDef.middleware) {
      if (!hasPrintFlagHeader) {
        console.log('Flags:');
        hasPrintFlagHeader = true;
      }
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
  for (const [name, flag] of Object.entries(flags).filter(
    ([, flag]) => !flag.hidden
  )) {
    console.log(
      `--${bold(name)}${flag.char ? `, -${bold(flag.char)}` : ''} ${dim(
        flag.description ?? ''
      )}`
    );
    // @ts-expect-error This is specific to enum flags, maybe flag types have their own help text function?
    const options = flag.options;
    if (options) {
      console.log(`    Options: ${options.join(', ')}`);
    }
    const defaultValue = flag.default;
    if (defaultValue !== undefined) {
      console.log(`    Default: ${defaultValue}`);
    }
  }
}

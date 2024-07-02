import { serverRequesterMiddleware } from '../middleware/add-server-requester.js';
import { Command } from '../command.js';
import prompts from 'prompts';
import { CONFIG_KEYS, config, getTelemetryEnabled } from '../config.js';

export default Command({
  description: 'Sets global configuration options',
  middleware: [serverRequesterMiddleware],
  flags: {},
  args: [
    {
      name: 'op',
      description: 'The operation to perform',
      required: true,
    },
    {
      name: 'key',
      description: 'The key of the configuration option to set',
      required: true,
    },
    {
      name: 'value',
      description: 'The value to set the configuration option to',
      required: false,
    },
  ],
  run: async ({ args, ctx, flags }) => {
    // temporary check
    if (args.key != 'TELEMETRY') {
      console.error(`${args.key} is not a valid configuration key.`);
      return;
    }
    if (args.op === 'get') {
      // const value = config.get(args.key);
      // console.log(value);
      console.log(getTelemetryEnabled() ? 'Enabed' : 'Disabled');
      return;
    }
    if (args.op !== 'set') {
      console.error('Invalid operation. Should be either "get" or "set"');
      return;
    }
    let value = args.value;
    if (args.value == null) {
      const response = await prompts({
        type: 'toggle',
        name: 'value',
        message: `Enter the value to set ${args.key} to`,
        active: 'enabled',
        inactive: 'disabled',
        initial: getTelemetryEnabled(),
      });
      value = response.value;
    }
    try {
      const parsedValue = parseBooleanWithSynonyms(value);
      config.set(args.key, parsedValue);
      console.log(`Set ${args.key} to ${parsedValue}`);
    } catch (e) {
      console.error(
        `Error: ${value} is not a valid value for ${args.key}. Should be true or false.`
      );
    }
  },
});

function parseBooleanWithSynonyms(input: string | boolean | number) {
  if (typeof input === 'boolean') {
    return input;
  }

  if (typeof input === 'number') {
    return input !== 0;
  }

  const lowerInput = input.toLowerCase();
  if (
    lowerInput === 'true' ||
    lowerInput === 'enabled' ||
    lowerInput === 'on' ||
    lowerInput === 'yes' ||
    lowerInput === 'y' ||
    lowerInput === '1'
  ) {
    return true;
  }
  if (
    lowerInput === 'false' ||
    lowerInput === 'disabled' ||
    lowerInput === 'off' ||
    lowerInput === 'no' ||
    lowerInput === 'n' ||
    lowerInput === '0'
  ) {
    return false;
  }
  throw new Error('Invalid boolean value');
}

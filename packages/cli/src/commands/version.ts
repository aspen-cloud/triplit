import { blue } from 'ansis/colors';
import { Command } from '../command.js';

export default Command({
  description: 'Print the CLI version',
  run: async () => {
    const { version, devDependencies } = require('../../package.json');
    const serverVersion = devDependencies['@triplit/server-core'];
    console.log(`CLI version: ${blue(version)}`);
    console.log(`Local dev server version: ${blue(serverVersion)}`);
  },
});

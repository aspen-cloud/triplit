import { Command } from '../../command.js';
import { getConfig } from '../../project-config.js';
import { blue, green } from 'ansis/colors';

export default Command({
  description: 'Manage a Triplit Cloud project',
  flags: {},
  preRelease: false,
  middleware: [],
  async run({ ctx }) {
    const config = getConfig();
    if (!config) {
      console.log(
        `\nNo project found. Run ${green(
          '`triplit project create`'
        )} to create a new project or ${green(
          '`triplit link`'
        )} to link to an existing project.\n`
      );
      return;
    }
    console.log(
      `\nManage this project at:\n\n${blue(
        `https://triplit.dev/dashboard/project/${config.id}`
      )}\n`
    );
  },
});

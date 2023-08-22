import { Command, ux } from '@oclif/core';

export default class Dev extends Command {
  static description = 'describe the command here';

  static examples = ['<%= config.bin %> <%= command.id %>'];

  static flags = {};

  static args = {};

  public async run(): Promise<void> {
    console.warn("This is a mock command and doesn't run anything");

    ux.action.start('starting dev servers');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    ux.action.stop();

    const processes = [
      { name: 'Triplit Console', port: 4000 },
      { name: 'Triplit Database', port: 5432 },
    ];

    ux.table(processes, { name: { header: 'Service' }, port: {} });
  }
}

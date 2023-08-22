import { ServerCommand } from '../../base-commands/server-command';

export default class MigrateStatus extends ServerCommand {
  static description = 'get the status of schema migrations for your project';

  static examples = ['<%= config.bin %> <%= command.id %>'];

  static flags = {};

  static args = {};

  public async run(): Promise<void> {
    // const { args, flags } = await this.parse(MigrateStatus);

    const resp = await this.request('GET', '/migration/status');

    this.log(resp);
  }
}

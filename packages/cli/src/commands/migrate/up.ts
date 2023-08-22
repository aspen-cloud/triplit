import { MigrationCommand } from '../../base-commands/migration-command';

export default class MigrateUp extends MigrationCommand {
  static description = 'describe the command here';

  static examples = ['<%= config.bin %> <%= command.id %>'];

  static flags = {
    ...MigrationCommand.baseFlags,
  };

  static args = {};

  public async run(): Promise<void> {
    // const { args, flags } = await this.parse(MigrateUp);

    this.log('local migrations', this.migrations);
  }
}

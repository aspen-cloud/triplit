import {
  CommandInfo,
  CommandTree,
  findCommands,
  isCommandInfo,
} from './src/command-utils';

const commandSources = findCommands('./commands');

const commandFiles = commandSourcesToFiles(commandSources);

const result = await Bun.build({
  entrypoints: ['./src/index.ts', ...commandFiles],
  target: 'node',
  outdir: './dist',
  minify: true,
});

console.log(result);

function commandSourcesToFiles(cmdTree: CommandTree | CommandInfo): string[] {
  if (isCommandInfo(cmdTree)) {
    return [cmdTree.sourcePath];
  }
  return Object.values(cmdTree).flatMap(commandSourcesToFiles);
}

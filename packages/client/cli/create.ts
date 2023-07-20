import fs from 'fs';
import path from 'path';
import process from 'process';

function sanitizeFilename(filename: string) {
  return filename
    .replace(/[^a-z0-9]/gi, '_') // Replace any character not alphanumeric with '_'
    .replace(/^-*|-*$/g, '') // Remove leading or trailing '-'
    .replace(/__*/g, '_') // Replace consecutive '_' with a single '_'
    .toLowerCase();
}

export type CreateCommandArgs = {
  migrationName: string;
};

// Todo: validate migration name provided
export function createCommand(args: CreateCommandArgs) {
  const cwd = process.cwd();
  const triplitDir = path.join(cwd, 'triplit');
  const migrationsDir = path.join(triplitDir, 'migrations');

  const sanitizedMigrationName = sanitizeFilename(args.migrationName);

  const files = fs.readdirSync(migrationsDir);
  files.sort();
  const parentVersion =
    files.length > 0 ? parseInt(files[files.length - 1].split('_')[0]) : 0;

  // define a name for the migration
  const timestamp = Date.now();
  const fileName = path.join(
    migrationsDir,
    `${timestamp}_${sanitizedMigrationName}.json`
  );

  // define contents of the migration file
  const fileContent = `
{
  "up": [
    // TODO: Implement the migration changes
  ],
  "down": [
    // TODO: Implement the migration changes
  ],
  "version": ${timestamp},
  "parent": ${parentVersion}
}
`.trim();

  fs.mkdirSync(path.dirname(fileName), { recursive: true });
  fs.writeFile(fileName, fileContent, 'utf8', (err) => {
    if (err) throw err;
    console.log(`Migration file created at ${fileName}`);
  });
}

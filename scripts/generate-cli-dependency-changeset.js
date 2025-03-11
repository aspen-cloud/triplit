/**
 * Our @triplit/cli package uses a bundler + dev deps to cut down the install time, but changesets doesn't pick up on changes to these dev deps: https://github.com/changesets/changesets/issues/944
 * This script generates a manual changeset for the CLI if any of its dependencies have changed.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CLI_DEPS = [
  '@triplit/client',
  '@triplit/db',
  '@triplit/server',
  '@triplit/server-core',
];

// Get changesets info
const changesetStatusOutput = execSync('yarn exec changeset status').toString();

// If changeset status output contains any CLI deps, generate a patch changeset for the CLI
if (CLI_DEPS.some((dep) => changesetStatusOutput.includes(dep))) {
  const changesetPath = path.join(
    __dirname,
    '../.changeset/manual-cli-changeset.md'
  );
  fs.writeFileSync(
    changesetPath,
    `---
'@triplit/cli': patch
---

Manual version bump for CLI dependencies`
  );
  console.log(`Generated manual CLI changeset at ${changesetPath}`);
}

/**
 * Certain packages have custom builds, but changesets doesn't pick up on changes to them: https://github.com/changesets/changesets/issues/944
 * This script generates changesets packages when their dependencies change
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get changesets info
const changesetStatusOutput = execSync('yarn exec changeset status').toString();

// Inspect packages for dev dependencies
function getTriplitDependencies(location) {
  const packageJsonPath = path.join(__dirname, `../${location}/package.json`);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  return Array.from(
    new Set(
      Object.keys(packageJson.dependencies || {})
        .concat(Object.keys(packageJson.devDependencies || {}))
        .filter((dep) => dep.startsWith('@triplit/'))
    )
  );
}

function generateChangesetText(package) {
  return `---
'${package}': patch
---

Automated version bump for ${package} after dependency changes`;
}

function generateChangeset(package, dependencies) {
  if (
    dependencies.some((dep) => changesetStatusOutput.includes(`- ${dep}\n`))
  ) {
    const sanitizedPackage = package.replace(/@/g, '').replace(/\//g, '-');
    const changesetPath = path.join(
      __dirname,
      `../.changeset/auto-${sanitizedPackage}-changeset.md`
    );
    fs.writeFileSync(changesetPath, generateChangesetText(package));
    console.log(`Auto-generated changeset at ${changesetPath}`);
  }
}

// Generate changeset for @triplit/cli
generateChangeset('@triplit/cli', getTriplitDependencies('packages/cli'));
// Generate changeset for create-triplit-app
generateChangeset(
  'create-triplit-app',
  Array.from(
    new Set([
      ...getTriplitDependencies('packages/create-triplit-app'),
      'angular-template',
      ...getTriplitDependencies('templates/angular'),
      'react-template',
      ...getTriplitDependencies('templates/react'),
      'svelte-template',
      ...getTriplitDependencies('templates/svelte'),
      'vue-template',
      ...getTriplitDependencies('templates/vue'),
    ])
  )
);

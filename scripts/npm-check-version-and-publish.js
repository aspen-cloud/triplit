const execSync = require('child_process').execSync;
const callerPath = process.cwd();
const packageJson = require(callerPath + '/package.json');
const semver = require('semver');

const publishedVersion = getPublishedVersion();
const currentVersion = packageJson.version;
console.log({ package: packageJson.name, publishedVersion, currentVersion });
if (!publishedVersion || semver.gt(currentVersion, publishedVersion)) {
  console.log('New version detected. Publishing...');
  execSync('yarn npm publish --access public --tag canary', {
    stdio: 'inherit',
  });
} else {
  console.log('Current version is already published. Skipping publish...');
}

function getPublishedVersion() {
  try {
    const publishedVersionsString = execSync(
      `yarn npm info ${packageJson.name} --fields dist-tags --json`,
      {
        encoding: 'utf-8',
      }
    );
    const publishedVersions = JSON.parse(publishedVersionsString);
    // dist-tags latest is the latest stable release
    // use canary while on next-gen
    return (
      publishedVersions['dist-tags'].canary ??
      publishedVersions['dist-tags'].latest
    );
  } catch (e) {
    // Catch 404 which has no published version
    if (e.output[1].toString('utf-8').includes('Package not found')) {
      return undefined;
    }
    throw e;
  }
}

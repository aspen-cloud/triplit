const execSync = require('child_process').execSync;
const callerPath = process.cwd();
const packageJson = require(callerPath + '/package.json');
const semver = require('semver');

const publishedVersion = getPublishedVersion();
const currentVersion = packageJson.version;

if (!publishedVersion || semver.gt(currentVersion, publishedVersion)) {
  console.log('New version detected. Publishing...');
  execSync('yarn npm publish --access public', { stdio: 'inherit' });
} else {
  console.log('Current version is already published. Skipping publish...');
}

function getPublishedVersion() {
  try {
    const publishedVersionsString = execSync(
      `yarn npm info ${packageJson.name} --fields versions`,
      {
        encoding: 'utf-8',
      }
    ).trim();
    const publishedVersions = publishedVersionsString
      .match(/'([^']+)'/g)
      .map((version) => version.replace(/'/g, '')); // extracts versions and removes quotes
    return semver.maxSatisfying(publishedVersions, '*'); // gets the highest version using semver
  } catch (e) {
    // Catch 404 which has no published version
    if (e.output[1].toString('utf-8').includes('404 (Not Found)')) {
      return undefined;
    }
    throw e;
  }
}

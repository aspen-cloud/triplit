import semver from 'semver';
import packageJson from '../package.json' assert { type: 'json' };
import { execSync } from 'child_process';

// I think this is only the 100 latest published tags, however that should be enough for our purposes
const TAGS_URI = `https://hub.docker.com/v2/repositories/aspencloud/triplit-db/tags`;

async function getLatestImageTags() {
  try {
    const response = await fetch(TAGS_URI, { method: 'GET' });
    const payload = await response.json();
    return payload.results.map((tag) => tag.name);
  } catch (error) {
    console.error('Error fetching tags:', error.message);
    throw error;
  }
}

async function publishIfNewVersion() {
  const imageTags = await getLatestImageTags();
  const versionTags = imageTags.filter((tag) => semver.valid(tag));
  const latestPublishedVersion = semver.maxSatisfying(versionTags, '*');
  const currentVersion = packageJson.version;

  if (
    !latestPublishedVersion ||
    semver.gt(currentVersion, latestPublishedVersion)
  ) {
    console.log('New version detected. Publishing...');
    // working directory is package root
    execSync('yarn build', { stdio: 'inherit' });
    execSync('yarn publish', { stdio: 'inherit' });
  } else {
    console.log('Current version is already published. Skipping publish...');
  }
}

publishIfNewVersion();

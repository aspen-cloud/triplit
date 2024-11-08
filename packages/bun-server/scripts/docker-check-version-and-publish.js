import semver from 'semver';
import serverPackageJson from '../package.json' assert { type: 'json' };
import dbPackageJson from '../../db/package.json' assert { type: 'json' };
import { execSync } from 'child_process';

// I think this is only the 100 latest published tags, however that should be enough for our purposes
const TAGS_URI = `https://hub.docker.com/v2/repositories/aspencloud/triplit-server-bun/tags`;

async function getLatestImageTags() {
  try {
    const response = await fetch(TAGS_URI, { method: 'GET' });
    if (!response.ok) {
      if (response.status === 404) {
        console.error('No published tags found.');
        return [];
      }
      throw new Error(
        `Error fetching tags: ${response.status} ${await response.text()}`
      );
    }
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
  const currentVersion = serverPackageJson.version;

  if (
    !latestPublishedVersion ||
    semver.gt(currentVersion, latestPublishedVersion)
  ) {
    console.log('New version detected. Publishing...');
    // working directory is package root
    execSync('yarn publish', { stdio: 'inherit' });
    await recordImagePublish({
      server_version: currentVersion,
      db_version: dbPackageJson.version,
      image: `aspencloud/triplit-server-bun:${currentVersion}`,
    });
  } else {
    console.log('Current version is already published. Skipping publish...');
  }
}

// args: {server_version: string, db_version: string, image: string}
async function recordImagePublish(args) {
  if (!process.env.PROJECTS_ADMIN_API_URL) {
    console.error(
      'No PROJECTS_ADMIN_API_URL found in environment, unable to record image publish.'
    );
    return;
  }
  if (!process.env.PROJECTS_ADMIN_API_KEY) {
    console.error(
      'No PROJECTS_ADMIN_API_KEY found in environment, unable to record image publish.'
    );
    return;
  }

  try {
    const response = await fetch(
      `${process.env.PROJECTS_ADMIN_API_URL}/server_builds`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.PROJECTS_ADMIN_API_KEY}`,
          apiKey: process.env.PROJECTS_ADMIN_API_KEY,
        },
        body: JSON.stringify(args),
      }
    );
    if (!response.ok) {
      console.error(
        'Error recording image publish:',
        response.status,
        await response.text()
      );
    }
  } catch (e) {
    console.error('Error recording image publish:', e.message);
  }
}

publishIfNewVersion();

const execSync = require("child_process").execSync;
const callerPath = process.cwd();
const packageJson = require(callerPath + "/package.json");
const semver = require("semver");

const publishedVersionsString = execSync(
  `yarn npm info ${packageJson.name} --fields versions`,
  {
    encoding: "utf-8",
  }
).trim();
const publishedVersions = publishedVersionsString
  .match(/'([^']+)'/g)
  .map((version) => version.replace(/'/g, "")); // extracts versions and removes quotes
const publishedVersion = semver.maxSatisfying(publishedVersions, "*"); // gets the highest version using semver
const currentVersion = packageJson.version;

if (semver.gt(currentVersion, publishedVersion)) {
  console.log("New version detected. Publishing...");
  execSync("yarn npm publish --access public", { stdio: "inherit" });
} else {
  console.log("Current version is already published. Skipping publish...");
}

const execSync = require("child_process").execSync;
const callerPath = process.cwd();
const packageJson = require(callerPath + "/package.json");
const semver = require("semver");

const publishedVersion = execSync(`npm view ${packageJson.name} version`, {
  encoding: "utf8",
}).trim();
const currentVersion = packageJson.version;
execSync("pwd", { stdio: "inherit" });
if (semver.gt(currentVersion, publishedVersion)) {
  console.log("New version detected. Publishing...");
  execSync("yarn npm publish --access public", { stdio: "inherit" });
} else {
  console.log("Current version is already published. Skipping publish...");
}

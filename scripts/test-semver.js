const semver = require('semver');

function testSemver(versionA, versionB) {
  const isGt = semver.gt(versionA, versionB);
  console.log(versionA, isGt ? '>' : '<=', versionB);
}

testSemver('0.0.1', '0.0.2');
testSemver('0.0.2', '0.0.1');
testSemver('0.0.1-alpha-123', '0.0.1');
testSemver('0.0.1-alpha-123', '0.0.1-alpha-124');
testSemver('0.0.1-alpha-124', '0.0.1-alpha-123');
testSemver('0.0.2-alpha-123', '0.0.1');
testSemver('0.1.0-alpha-123', '0.0.1');

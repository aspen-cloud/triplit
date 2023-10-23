import { execSync } from 'child_process';
import fs from 'fs';

try {
  fs.copyFileSync('package.json', 'tmp_package.json');

  const packageJsonString = fs.readFileSync('package.json', 'utf8');
  const packageJson = JSON.parse(packageJsonString);
  packageJson.dependencies = Object.fromEntries(
    Object.entries(packageJson.dependencies).filter(
      ([k, v]) => !k.startsWith('@triplit')
    )
  );

  fs.writeFileSync(
    'package.json',
    JSON.stringify(packageJson, null, 2),
    'utf8'
  );

  execSync('yarn npm publish --access public');
} finally {
  if (fs.existsSync('tmp_package.json')) {
    fs.copyFileSync('tmp_package.json', 'package.json');
    fs.rmSync('tmp_package.json');
  }
}

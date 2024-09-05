set -e

# npm version patch

rm -rf dist
npm run build:all
cp package.json dist
cp .npmignore dist
cp README.md dist

cd dist
npm publish --access=public
cd ..
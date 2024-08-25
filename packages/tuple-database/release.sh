set -e

# npm version patch

rm -rf build
npm run build
cp package.json build
cp .npmignore build
cp README.md build

cd build
npm publish --access=public
cd ..
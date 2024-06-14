const fs = require('fs');
const path = require('path');

// Function to recursively search through directories
function searchInDirectory(dir, searchString) {
  let stringFound = false;
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch (e) {
    console.error(`Unable to scan directory: ${e}`);
    throw e;
  }

  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        stringFound = stringFound || searchInDirectory(filePath, searchString); // Recursively search in subdirectory
      } else if (filePath.endsWith('.d.ts')) {
        stringFound = stringFound || searchInFile(filePath, searchString);
      }
    } catch (e) {
      console.error(`Unable to get stats of file: ${e}`);
      throw e;
    }
  }

  return stringFound;
}

// Function to search for the string in a file
function searchInFile(file, searchString) {
  try {
    const data = fs.readFileSync(file, 'utf8');
    if (data.includes(searchString)) {
      console.log(`Found "${searchString}" in file: ${file}`);
      return true;
    }
    return false;
  } catch (e) {
    console.error(`Unable to read file: ${e}`);
    throw e;
  }
}

// Main function
function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error('invalid args');
    return;
  }

  const directory = args[0];
  const localImportPrefix = 'import("packages';

  const isMatch = searchInDirectory(directory, localImportPrefix);
  if (isMatch) {
    console.log(
      'Found local references in declarations. Please remove them before publishing.'
    );
    process.exit(1);
  }
}

// Run the main function
main();

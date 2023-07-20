const fs = require('fs');

const dbPkg = '@triplit/db';

const typeDepKeys = ['@sinclair/typebox', 'tuple-database'];

fs.readFile('package.json', 'utf8', function (err, data) {
  if (err) {
    return console.log(err);
  }

  fs.readFile('../db/package.json', 'utf8', function (err, dbData) {
    if (err) {
      return console.log(err);
    }

    // Include deps needed for types
    const dbPkgJson = JSON.parse(dbData);
    const typeDeps = {};
    typeDepKeys.forEach((dep) => {
      if (dbPkgJson.dependencies?.[dep])
        typeDeps[dep] = dbPkgJson.dependencies[dep];
    });

    const packageJson = JSON.parse(data);

    packageJson.dependencies = {
      ...(packageJson.dependencies ?? {}),
      ...typeDeps,
    };

    // Remove db from deps
    if (packageJson.dependencies && packageJson.dependencies[dbPkg]) {
      delete packageJson.dependencies[dbPkg];
    }

    fs.writeFile(
      'package.json',
      JSON.stringify(packageJson, null, 2),
      'utf8',
      function (err) {
        if (err) return console.log(err);
      }
    );
  });
});

// At the moment we aren't releasing @triplit/db to npm, so we include its types in the client package
// This ends up being a little awkard in a typescript monorepo, so this patches a few things as needed

const fs = require('fs');

let contents = fs.readFileSync('./dist/index.d.ts', 'utf8');

// Replace references to @triplit/db (which we need to resolve to the included local types)
contents = contents.replace(/@triplit\/db/g, 'db');

// Replace weird ref to "db/src" with "db/src/index" when generating type for db.query() ... this is a hack that we'll remove when we open source @triplit/db and we wont need to do this intermediate build step
// The root of this issue I think is actually somewhere in the @triplit/db builds step (see import('.'))
contents = contents.replace(/import\("db\/src"\)/g, `import("db/src/index")`);

// Append readable module declaration to index.d.ts
const entryModuleDeclaration = `

declare module "@triplit/client" {
    export * from "client/src/index"; 
}`;

contents += entryModuleDeclaration;

fs.writeFileSync('./dist/index.d.ts', contents, 'utf8');

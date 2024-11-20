# [Triplit](https://www.github.com/aspen-cloud/triplit) + React + Vite

Step-by-step guide: https://www.triplit.dev/docs/guides/react-tutorial

### What is Triplit?

Triplit is an open-source database that runs on both server and in browser. It supports pluggable storage (indexeddb, sqlite, durable objects), syncs over websockets, and works with your favorite framework (React, Solid, Vue, Svelte).

[Get started with Triplit](https://www.triplit.dev/docs/getting-started)

### This demo

This is a simple todos app that demonstrates how to use Triplit to handle querying, syncing, and persisting state in a React app powered by Vite.

You can build learn to build this app step-by-step by following our [guide in the Triplit docs](https://www.triplit.dev/docs/guides/react-tutorial).

### Run the demo

Install the dependencies

```bash
$ yarn # npm i, bun i, or pnpm i
```

Start the dev server

```bash
$ yarn dev # npm run dev, bun dev, or pnpm run dev
```

### Syncing

This demo can sync data between clients with the help of a sync server. Run:

```bash
$ yarn triplit dev # npx triplit dev, npm run triplit dev, bun triplit dev, or pnpm run triplit dev
```

This command will start a local _sync_ server and console where you can view your database. It will output some secrets that you can use
to create an `.env` file in your project directory:

```bash
TRIPLIT_DB_URL=http://localhost:6543
# replace this with the Triplit Service token output by `yarn triplit dev`
TRIPLIT_SERVICE_TOKEN=replace_me
VITE_TRIPLIT_SERVER_URL=$TRIPLIT_DB_URL
VITE_TRIPLIT_TOKEN=$TRIPLIT_SERVICE_TOKEN
```

If you open up `localhost:3000` (or wherever your todos app is running) in two different browsers, you should see data syncing between them.

### Persistence

By default, the `TriplitClient` defined in `/triplit/client.ts` will use in-memory storage that _will not_ persist between page refreshes.

To use IndexedDB and ensure persistence in the browser, update `client.ts` to:

```ts
import { TriplitClient } from '@triplit/client';
import { schema } from './schema';

export const triplit = new TriplitClient({
  storage: 'indexeddb',
  schema,
  serverUrl: import.meta.env.VITE_TRIPLIT_SERVER_URL,
  token: import.meta.env.VITE_TRIPLIT_TOKEN,
});
```

If you setup sync, the data in the development sync server will persist until you restart the server. This means that as long as your sync server is running, even if your browser client is use in-memory storage, the sync server will push data to it after it refreshes the page and it 'appear' to be persisted.

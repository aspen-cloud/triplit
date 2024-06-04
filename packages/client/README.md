# Triplit Client

`@triplit/client` is the official library running Triplit in the client and syncing with a Triplit server.

[Official documentation is hosted here](https://www.triplit.dev/docs)

## Installation

You can install `@triplit/client` using npm, pnpm, yarn, or bun:

```bash
npm i @triplit/client
pnpm add @triplit/client
yarn add @triplit/client
bun add @triplit/client
```

## Basic Usage

Here's a simple example of how to use `@triplit/client`:

```ts
import { Client } from '@triplit/client';

const client = new Client({
  /* configuration */
});

// Fetch data
const data = client.fetch(client.query('todos').build());

// Insert data
await client.transact(async (tx) => {
  await tx.insert('todos', {
    text: 'New Todo',
    tagIds: new Set(['tag1', 'tag2']),
  });
  await tx.insert('tags', {
    text: 'New Todo',
    tagIds: new Set(['tag1', 'tag2']),
  });
});
```

## Documentation

For more information and examples of `@triplit/client` in action, please refer to the official [Triplit documentation](https://www.triplit.dev/docs).

# Framework Bindings

| Framework | Package           | Docs                                                          |
| --------- | ----------------- | ------------------------------------------------------------- |
| Svelte    | `@triplit/svelte` | [Svelte Docs](https://www.triplit.dev/docs/frameworks/svelte) |
| React     | `@triplit/react`  | [React Docs](https://www.triplit.dev/docs/frameworks/react)   |

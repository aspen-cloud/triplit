# Triplit DB

![npm badge](https://img.shields.io/npm/v/@triplit/db)
![types badge](https://img.shields.io/npm/types/@triplit/db)
![build badge](https://github.com/aspen-cloud/triplit/actions/workflows/build-db.yml/badge.svg)
![coverage badge](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/pbohlman/f5f2c109373b081a8d894d8289f135e3/raw/triplit_coverage.json)
![twitter badge](https://img.shields.io/badge/twitter-%40triplit__dev-1DA1F2)

<!-- add these when the repo goes public -->
<!-- ![build badge](https://img.shields.io/github/actions/workflow/status/aspen-cloud/triplit/build-db?label=build) -->
<!-- ![license badge](https://img.shields.io/github/license/aspen-cloud/triplit) -->

Triplit DB is the embedded database that powers [Triplit](https://triplit.dev/), a complete solution to data persistence, state management, and realtime synchronization for web applications that want to go _fast_.

> ⚠️ Triplit DB is in alpha and does not strictly follow semantic versioning

### Goal

Triplit DB is designed to an run in any JS environment (browser, node, deno, React Native, etc) and provide expressive, fast, and live updating queries while maintaining consistency with many writers over a network.

### Features

Triplit DB has support for

- Reactive queries that are incrementally updated
- Built-in storage providers for in-memory, IndexedDB, and Sqlite
- Automatic indexing of object properties for fast querying
- Combine multiple storage layers in the same DB with granular scoping on reads and writes
- Persistent and/or ephemeral storage backends
- Transactions with rollback
- Schema for validation, type hinting and enhanced CRDT-based storage.
- First-party schema migration support

# Quick Start

1. Install from using your preferred packet manager.

   ```
   npm i @triplit/db
   // or
   pnpm add @triplit/db
   // or
   yarn add @triplit/db
   ```

2. Define a schema (optional)

   A schema can comprise multiple ‘collections’ (similar to a table in SQL). Using a schema in a Triplit DB will enable type checking and the full the benefit of our CRDT-based data structures, like sets.

   ```tsx
   import { Schema as S } from `@triplit/db`;

   const todoSchema = S.Schema({
     todos: {
       text: S.string(),
       created_at: S.string(),
       complete: S.boolean(),
       tags: S.Set(S.string())
     }
   })
   ```

3. Construct a Triplit DB

   ```tsx
   import TriplitDB from `@triplit/db`;

   const db = new TriplitDB({
     schema: todoSchema,
   })
   ```

   By default your DB will be stored ephemerally and not persist through page refreshes. To add persistent storage, initialize the `TriplitDB` with the IndexedDB storage engine. This will store your data in the browser’s IndexedDB database and persist through refreshes.

   ```tsx
   import { TriplitDB, IndexedDBStorage } from '@triplit/db';

   const db = new TriplitDB({
     schema: todoSchema,
     source: new IndexedDBStorage(),
   });
   ```

4. Define read and write queries

   ```tsx
   function createTodo(todoText, todoTags) {
     db.transact(async (tx) => {
       await tx.insert('todos', {
         text: todoText,
         completed: false,
         tagIds: new Set(todoTags),
         created_at: new Date().toISOString(),
       });
     });
   }

   function fetchTodos() {
     db.fetch(db.query('todos').build());
   }
   ```

   Triplit DB queries support several filter operations. Read the docs for our [client](https://www.triplit.dev/docs/queries) for more information.

# How it works

Under the hood, Triplit DB utilizes a timestamped [Triple Store](https://en.wikipedia.org/wiki/Triplestore) to support efficiently merging changes from multiple sources whether that’s multiple writers or multiple storage layers. Each object that’s inserted is decomposed into a EAV triple of Entity (ID), Attribute (path in the object), and a Value. Each triple is stored with a [Lamport Timestamp](https://en.wikipedia.org/wiki/Lamport_timestamp) and treated as a [Last Writer Wins Register (LWW)](https://www.notion.so/You-probably-don-t-need-text-CRDTs-dce9cf7a42b64726893b3d69cd9070c3?pvs=21). To support multiple storage backends, Triplit DB uses [Tuple Database](https://github.com/ccorcos/tuple-database/) as a generic querying interface and transaction manager.

# Documentation

For more information and examples of the TriplitDB in action, please refer to the official Triplit documentation. For the features listed below, the client exposes the same API as the underlying Triplit DB.

- [Queries](https://www.triplit.dev/docs/queries)
- [Mutations](https://www.triplit.dev/docs/mutations)
- [Schemas](https://www.triplit.dev/docs/schemas)
- [Storage](https://www.triplit.dev/docs/storage)

# Contact us

We’re actively developing TriplitDB for use in the various parts of our fullstack product, Triplit, that provides a hosted syncing and storage service and a client library with wrappers for various front end frameworks.

If you are interested in helping us test Triplit or use it in a project, sign up [here](https://www.triplit.dev/waitlist) so we can get in touch with you. You can also contact us directly at [hello@aspen.cloud](mailto:hello@aspen.cloud).

To stay updated, follow us on [Twitter](https://twitter.com/triplit_dev) and checkout our [roadmap](https://www.notion.so/7362bdf6512243fcbdfe03c9d56a5998?pvs=21).

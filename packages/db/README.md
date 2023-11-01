# TriplitDB

[![npm badge](https://img.shields.io/npm/v/@triplit/db)](https://www.npmjs.com/package/@triplit/db)
[![types badge](https://img.shields.io/npm/types/@triplit/db)](https://www.triplit.dev/docs/schemas)
![build badge](https://github.com/aspen-cloud/triplit/actions/workflows/build-db.yml/badge.svg)
![coverage badge](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/pbohlman/f5f2c109373b081a8d894d8289f135e3/raw/triplit_coverage.json)
[![twitter badge](https://img.shields.io/badge/twitter-%40triplit__dev-1DA1F2)](https://twitter.com/triplit_dev)

<!-- add these when the repo goes public -->
<!-- ![build badge](https://img.shields.io/github/actions/workflow/status/aspen-cloud/triplit/build-db?label=build) -->
<!-- [![license badge](https://img.shields.io/github/license/aspen-cloud/triplit)](https://github.com/aspen-cloud/triplit/blob/main/LICENSE) -->

TriplitDB is the embedded database that powers [Triplit](https://triplit.dev/), a complete solution to data persistence, state management, and realtime synchronization for web applications that want to go _fast_.

> ⚠️ TriplitDB is in alpha and does not strictly follow semantic versioning

### Goal

TriplitDB is designed to run in any JS environment (browser, node, deno, React Native, etc) and provide expressive, fast, and live updating queries while maintaining consistency with many writers over a network.

### Features

TriplitDB has support for

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

   A schema can comprise multiple ‘collections’ (similar to a table in SQL). Using a schema with TriplitDB will enable type checking and the full the benefit of our CRDT-based data structures, like sets.

   ```tsx
   import { Schema as S } from `@triplit/db`;

   const todoSchema = S.Schema({
     todos: {
       text: S.String(),
       created_at: S.String(),
       complete: S.Boolean(),
       tags: S.Set(S.String())
     }
   })
   ```

3. Construct a TriplitDB instance

   ```tsx
   import TriplitDB from `@triplit/db`;

   const db = new TriplitDB({
     schema: todoSchema,
   })
   ```

   By default your data will be stored ephemerally in memory and not persist through page refreshes. To add persistent storage, initialize your `TriplitDB` instance with the IndexedDB storage engine. This will store your data in the browser’s IndexedDB database and persist through refreshes.

   ```tsx
   import TriplitDB, { IndexedDBStorage } from '@triplit/db';

   const db = new TriplitDB({
     schema: todoSchema,
     source: new IndexedDBStorage('db-name'),
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

   TriplitDB queries support several filter operations. Read the docs for our [client](https://www.triplit.dev/docs/queries) for more information.

# How it works

Under the hood, TriplitDB utilizes a timestamped [Triple Store](https://en.wikipedia.org/wiki/Triplestore) to support efficiently merging changes from multiple sources whether that’s multiple writers or multiple storage layers. Each object that’s inserted is decomposed into a EAV triple of Entity (ID), Attribute (path in the object), and a Value. Each triple is stored with a [Lamport Timestamp](https://en.wikipedia.org/wiki/Lamport_timestamp) and treated as a [Last Writer Wins Register (LWW)](https://github.com/pfrazee/crdt_notes#last-writer-wins-register-lww-register). To support its tuple based storage system, TriplitDB uses [Tuple Database](https://github.com/ccorcos/tuple-database/) as a generic querying interface and transaction manager.

# Documentation

For more information and examples of TriplitDB in action, please refer to the official [Triplit documentation](https://wwww.triplit.dev/docs). For the features listed below, the client exposes the same API as TriplitDB.

- [Queries](https://www.triplit.dev/docs/queries)
- [Mutations](https://www.triplit.dev/docs/mutations)
- [Schemas](https://www.triplit.dev/docs/schemas)
- [Storage](https://www.triplit.dev/docs/storage)

# Contact us

We’re actively developing TriplitDB for use in the various parts of our fullstack product, [Triplit](https://www.triplit.dev), that provides a hosted syncing and storage service and a client library with wrappers for various front end frameworks.

If you're interested in helping us test Triplit or use it in a project, sign up [here](https://www.triplit.dev/waitlist) so we can get in touch with you.

The best way to get in touch is to join our [Discord](https://discord.gg/MRhJXkWV)! We're here to answer questions, help developers get started with Triplit and preview new features.

You can follow us on [Twitter/X](https://twitter.com/triplit_dev) to see our latest announcements, and check out our [Roadmap](https://www.triplit.dev/roadmap) to see everything we have planned.

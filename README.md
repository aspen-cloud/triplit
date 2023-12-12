![Triplit banner](https://www.triplit.dev/opengraph-image.png)

# Overview

[Triplit](https://www.triplit.dev) is a complete solution to data persistence, state management, and realtime synchronization for web applications that want to go fast.

We provide a real-time syncing datastore that you can drop into your app as a simple Typescript package. Triplit handles storing your data on the server and intelligently syncs your queries to your clients. **We call this type of system a “full stack database”**—you can watch our presentation to the [Local First community](https://localfirstweb.dev/) on this new paradigm [here](https://www.notion.so/Don-t-send-schema-triples-from-client-without-service-key-4e2c2f85f7d6401bb8ad6a942c9607ea?pvs=21).

Triplit brings together:

🔄 **Real-time sync** with incremental updates and conflict resolution at the property level

🏠 **Local caching** powered by a full-fledged client-side database

💽 **Durable server-side storage** with an admin dashboard

😃 **Optimistic updates** to make every interaction feel fast

🔗 **Relational querying** for complex data models

🛫 **Offline-mode** with automatic reconnection and consistency guarantees

🔙 **Rollback and retry management** on failed updates

🗂️ **Schemas** for data safety and Typescript autocompletion

🔐 **Authorization** with row level granularity

🤝 **Collaboration/Multiplayer** powered by [CRDTs](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type)

🏎️ **Low latency** with minimal network traffic using delta patches

📝 **Simple API** for querying and mutating data in both vanilla Javascript and React

✅ **Fully open-source!**

# Open-source projects

In `triplit/packages` you can find our open source projects:

- [TriplitDB](https://github.com/aspen-cloud/triplit/tree/main/packages/db) - Designed to run in any JS environment (browser, node, deno, React Native, etc) and provide expressive, fast, and live updating queries while maintaining consistency with many writers over a network.
- [Client](https://github.com/aspen-cloud/triplit/tree/main/packages/client) - Browser library to interact with local and remote TriplitDBs.
- [CLI](https://github.com/aspen-cloud/triplit/tree/main/packages/cli) - CLI tool with commands to scaffold a project, run the full-stack development environment, migrate a server, and more.
- [React](https://github.com/aspen-cloud/triplit/tree/main/packages/react) - React bindings for @triplit/client.
- [Console](https://github.com/aspen-cloud/triplit/tree/main/packages/console) - React app for viewing and mutating data in Triplit projects and managing their schemas.
- [Server](https://github.com/aspen-cloud/triplit/tree/main/packages/server) - Node server for syncing data between Triplit clients.
- [Server-core](https://github.com/aspen-cloud/triplit/tree/main/packages/server-core) - Utility library for servers running Triplit.
- [Docs](https://github.com/aspen-cloud/triplit/tree/main/packages/docs) - Triplit docs, built with Nextera.
- [Types](https://github.com/aspen-cloud/triplit/tree/main/packages/types) - Shared types for various Triplit projects.
- [UI](https://github.com/aspen-cloud/triplit/tree/main/packages/ui) - Shared UI components for Triplit frontend projects, built with [shadcn](https://ui.shadcn.com/).

# Contact us

If you're interested in helping us test Triplit or use it in a project, sign up [here](https://www.triplit.dev/waitlist) so we can get in touch with you.

The best way to get in touch is to join our [Discord](https://discord.gg/MRhJXkWV)! We're here to answer questions, help developers get started with Triplit and preview new features.

You can follow us on [Twitter/X](https://twitter.com/triplit_dev) to see our latest announcements, and check out our [Roadmap](https://www.triplit.dev/roadmap) to see everything we have planned.

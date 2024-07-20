# Triplit Chat Template

A template for building a chat app with offline-mode + caching, optimistic updates, sent/pending indicators, user accounts and authentication.

## Getting started

### Download the template and install its dependencies

```bash
yarn create triplit-app --template=chat && cd triplit-app && yarn install
```

### Run the Next.js dev server

```bash
yarn dev
```

### In another terminal, run the Triplit dev environment

To get syncing working between multiple clients, you'll need to start a local Triplit dev environment.

```bash
yarn triplit dev
```

This will spin up both the server responsible for syncing and a developer console for inspecting the data on the server. [Check out the docs](https://www.triplit.dev/docs/local-development#start-triplit-services) for more info on local development with Triplit.

### Configure your `.env`

This is a good time to set up your `.env`, which needs to be properly configured so that the Triplit Client running in your app and the dev environment can talk to each other. We include a mostly complete example `.env.example`, that needs two modification to start working.

- Rename it to `.env`
- Update the `TRIPLIT_SERVICE_TOKEN` with the `Service Token` in the CLI output after you run `yarn triplit dev`
- Optionally, register your app with [Github](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app) and update the `GITHUB_ID and GITHUB_SECRET` to add oauth support to the demo.

## Features

- Sent/unsent indicators for messages using Triplit's `syncStatus` query filter
- Offline support using Triplit's built-in offline cache and optimistic updates
- Realtime updates and syncing between clients using Triplit's sync engine
- User accounts stored in Triplit's remote database

## Triplit usage

Thanks to Triplit, we're able to build a fully-functional chat app with minimal business logic and no separate server or database. Here's how it works.

### Schema

In `triplit/schema.ts` we define the various collections for our app. Some are related to the chat functionality (`messages`, `conversations`) and others store the data for auth. You'll notice that some collections have relations defined by subqueries (`S.RelationMany(), S.RelationById()`) to other collections in the schema.

We can also enforce read and write permissions from the schema to make sure that users can only see chat messages in the conversations they're members of.

In the example below, our conversations collection has permissions defined that allow only members of a conversation to read it from the database, and a relation on the user collection so that we can easily query profile data (like a user's name) when we query a conversation.

```ts
  conversations: {
    schema: S.Schema({
      id: S.Id(),
      name: S.String(),
      members: S.Set(S.String()),
      membersInfo: S.RelationMany("users", {
        where: [["id", "in", "$members"]],
      }),
    }),
    permissions: {
      user: {
        read: {
          // You may only read conversations you are a member of
          filter: [["members", "=", "$role.userId"]],
        },
        insert: {
          // You may only create a conversation you are a member of it
          filter: [["members", "=", "$role.userId"]],
        },
        update: {
          // You may only update a conversation you are a member of it
          filter: [["members", "=", "$role.userId"]],
        },
      },
    },
  },
```

For more information on schemas and permissions, [check out the docs.](https://www.triplit.dev/docs/schemas)

### Queries

In `lib/triplit-hooks.ts` we define several queries for populating the ui with messages and conversations. These queries are live updating, so our components can read directly from the queries and react to data changes. For more information on querying data and the full list of filters and policies Triplit supports, check out the [client docs](https://www.triplit.dev/docs/client/query).

### Mutations

We provide some simple helper functions in `lib/triplit-mutations.ts` for mutating data with Triplit. For more information on mutations check out the [mutation docs](https://www.triplit.dev/docs/client/insert).

### Connection status

`@triplit/react` provides a `useConnectionStatus()` hook so that developers can easily indicate whether or not data is syncing to the remote. Check out `components/connection-status.tsx` to see it in action.

## Built with

- [Triplit](https://triplit.dev)
- Next.js 13 [App Directory](https://nextjs.org/docs/app)
- [Radix UI](https://www.radix-ui.com/) + [shadcn/ui](https://ui.shadcn.com/) components
- [Tailwind CSS](https://tailwindcss.com/)
- [Lucide](https://lucide.dev) Icons

## Questions/feedback

Get in touch with us on [Discord](https://discord.gg/q89sGWHqQ5).

## License

Licensed under the MIT license.

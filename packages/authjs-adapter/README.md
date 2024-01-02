# authjs-adapter

Official [Triplit](https://triplit.dev) adapter for Auth.js / NextAuth.js.

## Installation

```
npm install @triplit/authjs-adapter
```

## TriplitAdapter()

> **TriplitAdapter**(server, token, options)

## Setup

### Configure Auth.js

Add this adapter to your `pages/api/[...nextauth].js`` next-auth configuration object.

```
import NextAuth from "next-auth"
import { TriplitAdapter } from "@triplit/authjs-adapter"

// For more information on each option (and a full list of options) go to
// https://authjs.dev/reference/core#authconfig
export default NextAuth({
  // https://authjs.dev/reference/core/providers
  providers: [...],
  adapter: TriplitAdapter(
    process.env.TRIPLIT_DB_URL,
    process.env.TRIPLIT_SERVICE_TOKEN,
  ),
  // ...
})
```

### Setup your schema

In your `triplit/schema.ts` file, add the following collections:

```
{
    users: {
        schema: S.Schema({
            id: S.Id(),
            name: S.String({ nullable: true, default: null }),
            email: S.String({ nullable: true, default: null }),
            emailVerified: S.Date({ nullable: true, default: null }),
            image: S.String({ nullable: true, default: null }),
        }),
    },
    accounts: {
        schema: S.Schema({
            id: S.Id(),
            userId: S.String(),
            user: S.Query({
                collectionName: "users" as const,
                where: [["id", "=", "$userId"]],
            }),
            type: S.String(),
            provider: S.String(),
            providerAccountId: S.String(),
            refresh_token: S.String({ nullable: true, default: null }),
            access_token: S.String({ nullable: true, default: null }),
            expires_at: S.Number({ nullable: true, default: null }),
            token_type: S.String({ nullable: true, default: null }),
            scope: S.String({ nullable: true, default: null }),
            id_token: S.String({ nullable: true, default: null }),
            session_state: S.String({ nullable: true, default: null }),
        }),
    },
    sessions: {
        schema: S.Schema({
            id: S.Id(),
            userId: S.String(),
            user: S.Query({
                collectionName: "users" as const,
                where: [["id", "=", "$userId"]],
            }),
            expires: S.Date(),
            sessionToken: S.String(),
        }),
    },
    verificationTokens: {
        schema: S.Schema({
            id: S.Id(),
            identifier: S.String(),
            token: S.String(),
            expires: S.Date(),
        }),
    },
}
```

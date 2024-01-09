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

```js title="pages/api/auth/[...nextauth].js"
import NextAuth from "next-auth"
import { TriplitAdapter } from "@triplit/authjs-adapter"
import { schema } from "path/to/triplit/schema"

// For more information on each option (and a full list of options) go to
// https://authjs.dev/reference/core#authconfig
export default NextAuth({
  // https://authjs.dev/reference/core/providers
  providers: [...],
  adapter: TriplitAdapter({
    server: process.env.TRIPLIT_DB_URL,
    token: process.env.TRIPLIT_SERVICE_TOKEN,
    schema: schema
  }),
  // ...
})
```

### Setup the NextAuth schema

Add the following schema to your Triplit database. The schema is described [here](https://authjs.dev/reference/core/adapters#models).

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

In [local development](https://www.triplit.dev/docs/guides/local-development), the Auth.js models should be available for use.

### Managing user JWTs

Configure Auth.js to use JWTs and assign them proper fields.

To sign the JWT, install the `jose` package:

```bash npm2yarn
npm install jose
```

Using [Auth.js callbacks](https://authjs.dev/reference/core/types#callbacksoptionsp-a), create a valid token and append it to the `session` object.

```js title="pages/api/auth/[...nextauth].js"
import NextAuth from "next-auth"
import { TriplitAdapter } from "@auth/triplit-adapter"
import * as jwt from "jose"

// For more information on each option (and a full list of options) go to
// https://authjs.dev/reference/configuration/auth-options
export default NextAuth({
    // https://authjs.dev/reference/core/providers
 providers: [...],
  adapter: TriplitAdapter({...}),
  session: {
    strategy: "jwt" as const,
  },
  jwt: {
    secret: process.env.NEXTAUTH_SECRET,
    encode: async ({ secret, token, maxAge }) => {
      return await signToken(token, secret);
    },
    decode: async ({ secret, token }) => {
      return await decodeToken(token!, secret)
    },
  },
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token["x-triplit-user-id"] = user.id
      }
      token["x-triplit-project-id"] = process.env.NEXT_PUBLIC_PROJECT_ID
      token["x-triplit-token-type"] = "external"
      return token
    },
    async session({ session, token, user }) {
      if (process.env.NEXTAUTH_SECRET) {
        session.token = await signToken(token, process.env.NEXTAUTH_SECRET)
      }
      return session
    },
    async authorized({ request, auth }) {
      return !!auth
    },
  },
  // ...
});

async function signToken(token: any, secret: string) {
  const alg = "HS256"
  const secretKey = new TextEncoder().encode(secret)
  const encodedToken = await new jwt.SignJWT(token)
    .setIssuedAt()
    .setExpirationTime("24h")
    .setProtectedHeader({ alg })
    .sign(secretKey)
  return encodedToken
}

async function decodeToken(token: string, secret: string) {
  const secretKey = new TextEncoder().encode(secret)
  const decodedToken = await jwt.jwtVerify(token, secretKey, {
    algorithms: ["HS256"],
  })
  return decodedToken.payload
}
```

## Example

Check out Triplit's [example chat app](https://github.com/aspen-cloud/triplit/tree/main/templates/chat-template) for a full example.

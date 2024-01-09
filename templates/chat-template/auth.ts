// import CredentialsProvider from "next-auth/providers/credentials"
import CredentialsProvider from "@auth/core/providers/credentials"
import { TriplitAdapter } from "@triplit/authjs-adapter"
// import jwt from "jsonwebtoken"
import * as jwt from "jose"
import NextAuth, { NextAuthConfig } from "next-auth"
import GithubProvider from "next-auth/providers/github"

import { isPasswordValid } from "./lib/crypt.js"
import { schema } from "./triplit/schema.js"

export const authOptions: NextAuthConfig = {
  adapter: TriplitAdapter({
    server: process.env.TRIPLIT_DB_URL!,
    token: process.env.TRIPLIT_SERVICE_TOKEN!,
    schema: schema,
  }),
  // Configure one or more authentication providers
  providers: [
    // ...add more providers here
    CredentialsProvider({
      // The name to display on the sign in form (e.g. 'Sign in with...')
      name: "Credentials",
      // The credentials is used to generate a suitable form on the sign in page.
      // You can specify whatever fields you are expecting to be submitted.
      // e.g. domain, username, password, 2FA token, etc.
      // You can pass any HTML attribute to the <input> tag through the object.
      credentials: {
        username: { label: "Username", type: "text", placeholder: "jsmith" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        // You need to provide your own logic here that takes the credentials
        // submitted and returns either a object representing a user or value
        // that is false/null if the credentials are invalid.
        // e.g. return { id: 1, name: 'J Smith', email: 'jsmith@example.com' }
        // You can also use the `req` object to obtain additional parameters
        // (i.e., the request IP address
        const res = await fetch(process.env.TRIPLIT_DB_URL + "/fetch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + process.env.TRIPLIT_SERVICE_TOKEN,
          },
          body: JSON.stringify({
            query: {
              collectionName: "credentials",
              where: [["username", "=", credentials.username]],
              limit: 1,
            },
          }),
        })

        if (!res.ok) {
          return null
        }
        const authInfo = (await res.json())?.result?.[0]?.[1]

        if (!authInfo) {
          return null
        }

        const isPasswordMatch = await isPasswordValid(
          credentials.password,
          authInfo.password
        )

        if (!isPasswordMatch) {
          return null
        }

        const user = await fetch(process.env.TRIPLIT_DB_URL + "/fetch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + process.env.TRIPLIT_SERVICE_TOKEN,
          },
          body: JSON.stringify({
            query: {
              collectionName: "users",
              where: [["id", "=", authInfo.userId]],
              limit: 1,
            },
          }),
        })

        if (!user.ok) return null
        const profile = (await user.json())?.result?.[0]?.[1]
        if (!profile) return null

        return profile
      },
    }),
    GithubProvider({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
  ],
  session: {
    strategy: "jwt" as const,
  },
  jwt: {
    secret: process.env.NEXTAUTH_SECRET,
    encode: async ({ secret, token, maxAge }) => {
      return await signToken(token, secret)
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
  pages: {
    signIn: "/auth/sign-in",
  },
}

export const {
  handlers: { GET, POST },
  auth,
} = NextAuth(authOptions)

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

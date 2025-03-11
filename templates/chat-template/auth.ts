import { AuthOptions } from "next-auth"
import GithubProvider from "next-auth/providers/github"

import { adapter } from "./lib/auth-adapter.js"
import { CREDENTIALS_PROVIDER } from "./lib/credentials-provider.js"
import { jwtDecode, jwtEncode } from "./lib/next-auth.js"
import { signToken } from "./lib/token.js"

const providers: AuthOptions["providers"] = [CREDENTIALS_PROVIDER]
if (process.env.GITHUB_ID && process.env.GITHUB_SECRET) {
  providers.push(
    GithubProvider({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    })
  )
}

export const authOptions: AuthOptions = {
  adapter: adapter,
  // Configure one or more authentication providers
  providers: providers,
  session: {
    strategy: "jwt" as const,
  },
  jwt: {
    secret: process.env.NEXTAUTH_SECRET,
    encode: jwtEncode,
    decode: jwtDecode,
  },
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token["x-triplit-user-id"] = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (process.env.NEXTAUTH_SECRET) {
        session.token = await signToken(token, process.env.NEXTAUTH_SECRET)
      }
      if (session.user) {
        session.user.id = token["x-triplit-user-id"] as string | undefined
      }
      return session
    },
  },
  pages: {
    signIn: "/auth/sign-in",
  },
}

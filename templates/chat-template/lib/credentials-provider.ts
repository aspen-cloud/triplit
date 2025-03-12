import CredentialsProvider from "next-auth/providers/credentials"

import { isPasswordValid } from "./crypt.js"

export const CREDENTIALS_PROVIDER = CredentialsProvider({
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
    if (!credentials) return null
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

    const authInfo = (await res.json())?.[0]

    if (!authInfo) {
      return null
    }

    const isPasswordMatch = await isPasswordValid(
      credentials.password as string,
      authInfo.password
    )

    if (!isPasswordMatch) {
      return null
    }

    const response = await fetch(process.env.TRIPLIT_DB_URL + "/fetch", {
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

    if (!response.ok) return null
    const profile = (await response.json())?.[0]
    if (!profile) return null

    return profile
  },
})

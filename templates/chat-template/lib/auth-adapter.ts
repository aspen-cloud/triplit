import type { Adapter } from "@auth/core/adapters"

export default function TriplitAdapter(
  server: string,
  token: string,
  options = {
    sessionCollectionName: "sessions",
    userCollectionName: "users",
    accountCollectionName: "accounts",
    verificationRequestCollectionName: "verificationRequests",
  }
): Adapter {
  const fetchData = async (uri: string, method: string, body: any) => {
    const res = await fetch(server + uri, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  }
  return {
    async createUser(user) {
      const res = await fetchData("/insert", "POST", {
        collectionName: options.userCollectionName,
        entity: user,
      })
      return res.output
    },
    // @ts-expect-error
    async getUser(id) {
      const res = await fetchData("/fetch", "POST", {
        query: {
          collectionName: options.userCollectionName,
          entityId: id,
        },
      })
      const user = new Map(res.result).get(id) ?? null
      return user
    },
    async getUserByEmail(email) {
      const res = await fetchData("/fetch", "POST", {
        query: {
          collectionName: options.userCollectionName,
          where: [["email", "=", email]],
          limit: 1,
        },
      })
      const user = res.result?.[0]?.[1]
      return user
    },
    // @ts-expect-error
    async getUserByAccount({ providerAccountId, provider }) {
      const accountRes = await fetchData("/fetch", "POST", {
        query: {
          collectionName: options.accountCollectionName,
          where: [
            ["provider", "=", provider],
            ["providerAccountId", "=", providerAccountId],
          ],
          limit: 1,
        },
      })
      const account = accountRes.result?.[0]?.[1]
      if (!account) return null
      const userRes = await fetchData("/fetch", "POST", {
        query: {
          collectionName: options.userCollectionName,
          entityId: account.userId,
        },
      })
      const user = new Map(userRes.result).get(account.userId) ?? null
      return user
    },
    async updateUser(user) {
      const patches = extractNestedObjectValues(user).map((tuple) => [
        "set",
        ...tuple,
      ])
      const res = await fetchData("/update", "POST", {
        collectionName: options.userCollectionName,
        entityId: user.id,
        patches,
      })
      return res.output
    },
    async linkAccount(account) {
      const res = await fetchData("/insert", "POST", {
        collectionName: options.accountCollectionName,
        entity: account,
      })
      return res.output
    },
    async unlinkAccount({ providerAccountId, provider }) {
      throw new Error("Not implemented")
    },
    async createSession({ sessionToken, userId, expires }) {
      const res = await fetchData("/insert", "POST", {
        collectionName: options.sessionCollectionName,
        // TODO: possibly use dates...
        entity: { sessionToken, userId, expires: expires.toISOString() },
      })
      return res.output
    },
    async getSessionAndUser(sessionToken) {
      throw new Error("Not implemented")
    },
    async updateSession(newSession) {
      const sessionResult = await fetchData("/fetch", "POST", {
        query: {
          collectionName: options.sessionCollectionName,
          where: [["sessionToken", "=", newSession.sessionToken]],
          limit: 1,
        },
      })
      const session = sessionResult.result?.[0]?.[1]
      if (!session) throw new Error("Session not found")
      const patches = extractNestedObjectValues(newSession).map((tuple) => [
        "set",
        ...tuple,
      ])
      const updateResult = await fetchData("/update", "POST", {
        collectionName: options.sessionCollectionName,
        entityId: session.id,
        patches,
      })
      return updateResult.output
    },
    async deleteSession(sessionToken) {
      return
    },
  }
}

function extractNestedObjectValues(obj: Record<string, any>) {
  let result: any[] = []

  function recurse(subObj: Record<string, any>, path: string[] = []) {
    for (let key in subObj) {
      if (subObj.hasOwnProperty(key)) {
        let newPath = path.concat(key)
        if (typeof subObj[key] === "object" && subObj[key] !== null) {
          recurse(subObj[key], newPath)
        } else {
          result.push([newPath, subObj[key]])
        }
      }
    }
  }

  recurse(obj)
  return result
}

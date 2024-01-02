import type { Adapter, AdapterUser } from '@auth/core/adapters';

export function TriplitAdapter(
  server: string,
  token: string,
  options = {
    sessionCollectionName: 'sessions',
    userCollectionName: 'users',
    accountCollectionName: 'accounts',
    verificationRequestCollectionName: 'verificationRequests',
  }
): Adapter {
  // TODO: setup a nicer http api wrapper that handles requests, errors, (de)serialization, etc.
  const fetchData = async (uri: string, method: string, body: any) => {
    const res = await fetch(server + uri, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { result: undefined, error: await res.text() };
    return { result: await res.json(), error: undefined };
  };
  return {
    async createUser(user) {
      const { result } = await fetchData('/insert', 'POST', {
        collectionName: options.userCollectionName,
        entity: user,
      });
      return result?.output;
    },
    async getUser(id) {
      const { result } = await fetchData('/fetch', 'POST', {
        query: {
          collectionName: options.userCollectionName,
          entityId: id,
        },
      });
      const user = (new Map(result?.result ?? []).get(id) ??
        null) as AdapterUser | null;
      return user;
    },
    async getUserByEmail(email) {
      const { result } = await fetchData('/fetch', 'POST', {
        query: {
          collectionName: options.userCollectionName,
          where: [['email', '=', email]],
          limit: 1,
        },
      });
      const user = result?.result?.[0]?.[1];
      return user;
    },
    async getUserByAccount({ providerAccountId, provider }) {
      const { result: accountRes } = await fetchData('/fetch', 'POST', {
        query: {
          collectionName: options.accountCollectionName,
          where: [
            ['provider', '=', provider],
            ['providerAccountId', '=', providerAccountId],
          ],
          limit: 1,
          // We could make schema optional and do a manual join here
          include: { user: null },
        },
      });
      const account = accountRes.result?.[0]?.[1];
      if (!account) return null;
      const user = (new Map(account?.user ?? []).get(account.userId) ??
        null) as AdapterUser | null;
      return user;
    },
    async updateUser(user) {
      const patches = extractNestedObjectValues(user).map((tuple) => [
        'set',
        ...tuple,
      ]);
      const { result } = await fetchData('/update', 'POST', {
        collectionName: options.userCollectionName,
        entityId: user.id,
        patches,
      });
      return result?.output;
    },
    async linkAccount(account) {
      const { result } = await fetchData('/insert', 'POST', {
        collectionName: options.accountCollectionName,
        entity: account,
      });
      return result?.output;
    },
    async unlinkAccount({ providerAccountId, provider }) {
      const { result: accountResult } = await fetchData('/fetch', 'POST', {
        query: {
          collectionName: options.accountCollectionName,
          where: [
            ['provider', '=', provider],
            ['providerAccountId', '=', providerAccountId],
          ],
          limit: 1,
        },
      });
      const account = accountResult?.result?.[0]?.[1];
      if (!account) return;
      const { result: deleteResult } = await fetchData('/delete', 'POST', {
        collectionName: options.accountCollectionName,
        entityId: account.id,
      });
      if (!deleteResult) return;
      return account;
    },
    async createSession({ sessionToken, userId, expires }) {
      const { result } = await fetchData('/insert', 'POST', {
        collectionName: options.sessionCollectionName,
        entity: { sessionToken, userId, expires: expires.toISOString() },
      });
      return result?.output;
    },
    async getSessionAndUser(sessionToken) {
      const { result: sessionResult } = await fetchData('/fetch', 'POST', {
        query: {
          collectionName: options.sessionCollectionName,
          where: [['sessionToken', '=', sessionToken]],
          limit: 1,
          include: { user: null },
        },
      });
      const session = sessionResult?.result?.[0]?.[1];
      if (!session) return null;
      const user = (new Map(session?.user ?? []).get(session.userId) ??
        null) as AdapterUser | null;
      if (!user) return null;
      return { session, user };
    },
    async updateSession(newSession) {
      const { result: sessionResult } = await fetchData('/fetch', 'POST', {
        query: {
          collectionName: options.sessionCollectionName,
          where: [['sessionToken', '=', newSession.sessionToken]],
          limit: 1,
        },
      });
      const session = sessionResult?.result?.[0]?.[1];
      if (!session) return null;
      const patches = extractNestedObjectValues(newSession).map((tuple) => [
        'set',
        ...tuple,
      ]);
      const { result: updateResult } = await fetchData('/update', 'POST', {
        collectionName: options.sessionCollectionName,
        entityId: session.id,
        patches,
      });
      return updateResult?.output;
    },
    async deleteSession(sessionToken) {
      const { result: sessionResult } = await fetchData('/fetch', 'POST', {
        query: {
          collectionName: options.sessionCollectionName,
          where: [['sessionToken', '=', sessionToken]],
          limit: 1,
        },
      });
      const session = sessionResult?.result?.[0]?.[1];
      if (!session) return null;
      const { result: deleteResult } = await fetchData('/delete', 'POST', {
        collectionName: options.sessionCollectionName,
        entityId: session.id,
      });
      if (!deleteResult) return null;
      return session;
    },
  };
}

function extractNestedObjectValues(obj: Record<string, any>) {
  let result: any[] = [];

  function recurse(subObj: Record<string, any>, path: string[] = []) {
    for (let key in subObj) {
      if (subObj.hasOwnProperty(key)) {
        let newPath = path.concat(key);
        if (typeof subObj[key] === 'object' && subObj[key] !== null) {
          recurse(subObj[key], newPath);
        } else {
          result.push([newPath, subObj[key]]);
        }
      }
    }
  }

  recurse(obj);
  return result;
}

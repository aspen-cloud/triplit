import type { Adapter, AdapterUser } from '@auth/core/adapters';
import type { RemoteClient } from '@triplit/client';

export function TriplitAdapter(
  client: RemoteClient<any>,
  options = {
    sessionCollectionName: 'sessions',
    userCollectionName: 'users',
    accountCollectionName: 'accounts',
    verificationRequestCollectionName: 'verificationRequests',
  }
): Adapter {
  return {
    async createUser(user) {
      const result = await client.insert(options.userCollectionName, user);
      return result?.output;
    },
    async getUser(id) {
      const user =
        (await client.fetchById(options.userCollectionName, id)) ?? null;
      return user;
    },
    async getUserByEmail(email) {
      const user = await client.fetchOne({
        collectionName: options.userCollectionName,
        where: [['email', '=', email]],
      });
      return user;
    },
    async getUserByAccount({ providerAccountId, provider }) {
      const account = await client.fetchOne({
        collectionName: options.accountCollectionName,
        where: [
          ['provider', '=', provider],
          ['providerAccountId', '=', providerAccountId],
        ],
        // We could make schema optional and do a manual join here
        include: { user: null },
      });
      return account?.user?.get(account.userId) ?? null;
    },
    async updateUser(user) {
      const { id, ...rest } = user;
      const result = await client.update(
        options.userCollectionName,
        user.id,
        (entity) => {
          Object.entries(rest).forEach(([key, value]) => {
            entity[key] = value;
          });
        }
      );
      return result?.output;
    },
    async linkAccount(account) {
      const result = await client.insert(
        options.accountCollectionName,
        account
      );
      return result?.output;
    },
    async unlinkAccount({ providerAccountId, provider }) {
      const account = await client.fetchOne({
        collectionName: options.accountCollectionName,
        where: [
          ['provider', '=', provider],
          ['providerAccountId', '=', providerAccountId],
        ],
      });
      if (!account) return;
      await client.delete(options.accountCollectionName, account.id);
      return account;
    },
    async createSession(session) {
      const result = await client.insert(
        options.sessionCollectionName,
        session
      );
      return result?.output;
    },
    async getSessionAndUser(sessionToken) {
      const session = await client.fetchOne({
        collectionName: options.sessionCollectionName,
        where: [['sessionToken', '=', sessionToken]],
        include: { user: null },
      });
      if (!session) return null;
      const user = session?.user?.get(session.userId);
      if (!user) return null;
      return { session, user };
    },
    async updateSession(newSession) {
      const session = await client.fetchOne({
        collectionName: options.sessionCollectionName,
        where: [['sessionToken', '=', newSession.sessionToken]],
        select: ['id'],
      });
      const sessionId = session?.id;
      if (!session) return null;
      const result = await client.update(
        options.sessionCollectionName,
        sessionId,
        (entity) => {
          Object.entries(newSession).forEach(([key, value]) => {
            entity[key] = value;
          });
        }
      );
      return result?.output;
    },
    async deleteSession(sessionToken) {
      const session = await client.fetchOne({
        collectionName: options.sessionCollectionName,
        where: [['sessionToken', '=', sessionToken]],
        select: ['id'],
      });
      const sessionId = session?.id;
      if (!sessionId) return null;
      await client.delete(options.sessionCollectionName, sessionId);
      return session;
    },
  };
}

import type { Adapter, AdapterSession, AdapterUser } from '@auth/core/adapters';
import { RemoteClient } from '@triplit/client';
import { Models } from '@triplit/db';

export type TriplitAdapterConnectionOptions = {
  server: string;
  token: string;
  schema?: Models<any, any>;
  sessionCollectionName?: string;
  userCollectionName?: string;
  accountCollectionName?: string;
  verificationRequestCollectionName?: string;
};

/**
 *
 *
 */
export function TriplitAdapter(
  options: TriplitAdapterConnectionOptions
): Adapter {
  const client = new RemoteClient({
    server: options.server,
    token: options.token,
    schema: options.schema,
  });
  const collectionNames = {
    session: options.sessionCollectionName || 'sessions',
    user: options.userCollectionName || 'users',
    account: options.accountCollectionName || 'accounts',
    verificationRequest:
      options.verificationRequestCollectionName || 'verificationTokens',
  };

  return {
    async createUser(user) {
      const result = await client.insert(
        collectionNames.user,
        // @ts-expect-error
        user
      );
      return result?.output;
    },
    async getUser(id) {
      const user = ((await client.fetchById(collectionNames.user, id)) ??
        null) as AdapterUser | null;
      return user;
    },
    async getUserByEmail(email) {
      const user = await client.fetchOne({
        collectionName: collectionNames.user,
        where: [['email', '=', email]],
      });
      return user;
    },
    async getUserByAccount({ providerAccountId, provider }) {
      const account = await client.fetchOne({
        collectionName: collectionNames.account,
        where: [
          ['provider', '=', provider],
          ['providerAccountId', '=', providerAccountId],
        ],
        // We could make schema optional and do a manual join here
        include: {
          // @ts-expect-error needs to read schema to do this
          user: null,
        },
      });
      // @ts-expect-error
      return account?.user?.get(account.userId) ?? null;
    },
    async updateUser(user) {
      const { id, ...rest } = user;
      await client.update(collectionNames.user, user.id, (entity) => {
        Object.entries(rest).forEach(([key, value]) => {
          entity[key] = value;
        });
      });
      const updatedUser = await this.getUser!(id);
      if (!updatedUser) throw new Error('User not found');
      return updatedUser;
    },
    async linkAccount(account) {
      const result = await client.insert(collectionNames.account, account);
      return result?.output;
    },
    async unlinkAccount({ providerAccountId, provider }) {
      const account = await client.fetchOne({
        collectionName: collectionNames.account,
        where: [
          ['provider', '=', provider],
          ['providerAccountId', '=', providerAccountId],
        ],
      });
      if (!account) return;
      await client.delete(collectionNames.account, account.id);
      return account;
    },
    async createSession(session) {
      const result = await client.insert(collectionNames.session, session);
      return result?.output;
    },
    async getSessionAndUser(sessionToken) {
      const sessionWithUser = await client.fetchOne({
        collectionName: collectionNames.session,
        where: [['sessionToken', '=', sessionToken]],
        include: {
          // @ts-expect-error needs to read schema to do this
          user: null,
        },
      });
      if (!sessionWithUser) return null;
      const { user: userMap, ...session } = sessionWithUser;
      // @ts-expect-error
      const user = userMap?.get(session.userId);
      if (!user) return null;

      // @ts-expect-error
      return { session, user } as {
        session: AdapterSession;
        user: AdapterUser;
      };
    },
    async updateSession(newSession) {
      const session = await client.fetchOne({
        collectionName: collectionNames.session,
        where: [['sessionToken', '=', newSession.sessionToken]],
      });
      const sessionId = session?.id;
      if (!session) return null;
      await client.update(collectionNames.session, sessionId, (entity) => {
        Object.entries(newSession).forEach(([key, value]) => {
          entity[key] = value;
        });
      });
      const updatedSession =
        ((await client.fetchById(
          'sessions',
          sessionId
        )) as unknown as AdapterSession) ?? null;
      return updatedSession;
    },
    async deleteSession(sessionToken) {
      const session = await client.fetchOne({
        collectionName: collectionNames.session,
        where: [['sessionToken', '=', sessionToken]],
      });
      const sessionId = session?.id;
      if (!sessionId) return null;
      await client.delete(collectionNames.session, sessionId);
      return session;
    },
    async createVerificationToken(token) {
      const result = await client.insert(collectionNames.verificationRequest, {
        ...token,
        expires: token.expires.toISOString(),
      });
      return result?.output;
    },
    async useVerificationToken({ identifier, token }) {
      const result = await client.fetchOne({
        collectionName: collectionNames.verificationRequest,
        where: [
          ['identifier', '=', identifier],
          ['token', '=', token],
        ],
      });
      if (!result) return null;
      const { id, ...tokenResult } = result;
      await client.delete(collectionNames.verificationRequest, id);
      return tokenResult;
    },
    async deleteUser(userId) {
      const user = await client.fetchById(collectionNames.user, userId);
      if (!user) return null;
      const sessions = await client.fetch({
        collectionName: collectionNames.session,
        where: [['userId', '=', userId]],
      });
      for (const [id] of sessions) {
        await client.delete(collectionNames.session, id);
      }
      const accounts = await client.fetch({
        collectionName: collectionNames.account,
        where: [['userId', '=', userId]],
      });
      for (const [id] of accounts) {
        await client.delete(collectionNames.account, id);
      }
      await client.delete(collectionNames.user, userId);
      return user as unknown as AdapterUser;
    },
  };
}

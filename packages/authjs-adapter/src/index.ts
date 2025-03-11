import type {
  Adapter,
  AdapterAccount,
  AdapterSession,
  AdapterUser,
  VerificationToken,
} from '@auth/core/adapters';
import { HttpClient } from '@triplit/client';
import type { Models } from '@triplit/db';

export type TriplitAdapterConnectionOptions = {
  serverUrl: string;
  token: string;
  schema?: Models;
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
  const client = new HttpClient({
    serverUrl: options.serverUrl,
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
      const result = await client.insert(collectionNames.user, user);
      return result as AdapterUser;
    },
    async getUser(id) {
      const user = ((await client.fetchById(collectionNames.user, id)) ??
        null) as AdapterUser | null;
      return user;
    },
    async getUserByEmail(email) {
      const user = (await client.fetchOne({
        collectionName: collectionNames.user,
        where: [['email', '=', email]],
      })) as AdapterUser | null;
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
          user: true,
        },
      });
      return (account?.user as AdapterUser) ?? null;
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
      return result as AdapterAccount;
    },
    async unlinkAccount({ providerAccountId, provider }) {
      const account = (await client.fetchOne({
        collectionName: collectionNames.account,
        where: [
          ['provider', '=', provider],
          ['providerAccountId', '=', providerAccountId],
        ],
      })) as AdapterAccount | null;
      if (!account) return;

      await client.delete(
        collectionNames.account,
        // @ts-expect-error - id is specific to triplit
        account.id
      );
      return account;
    },
    async createSession(session) {
      const result = await client.insert(collectionNames.session, session);
      return result as AdapterSession;
    },
    async getSessionAndUser(sessionToken) {
      const sessionWithUser = await client.fetchOne({
        collectionName: collectionNames.session,
        where: [['sessionToken', '=', sessionToken]],
        include: {
          user: null,
        },
      });
      if (!sessionWithUser) return null;
      const { user, ...session } = sessionWithUser;
      if (!user) return null;
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
      const session = (await client.fetchOne({
        collectionName: collectionNames.session,
        where: [['sessionToken', '=', sessionToken]],
      })) as AdapterSession | null;
      // @ts-expect-error - id is specific to triplit
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
      return result as VerificationToken;
    },
    async useVerificationToken({ identifier, token }) {
      const result = (await client.fetchOne({
        collectionName: collectionNames.verificationRequest,
        where: [
          ['identifier', '=', identifier],
          ['token', '=', token],
        ],
      })) as VerificationToken | null;
      if (!result) return null;
      // @ts-expect-error - id is specific to triplit
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
      for (const session of sessions) {
        await client.delete(collectionNames.session, session.id);
      }
      const accounts = await client.fetch({
        collectionName: collectionNames.account,
        where: [['userId', '=', userId]],
      });
      for (const session of accounts) {
        await client.delete(collectionNames.account, session.id);
      }
      await client.delete(collectionNames.user, userId);
      return user as unknown as AdapterUser;
    },
  };
}

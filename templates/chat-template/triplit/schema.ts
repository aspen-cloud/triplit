import { Models, Schema as S } from "@triplit/db"

export const schema = {
  messages: {
    schema: S.Schema({
      id: S.Id(),
      conversationId: S.String(),
      sender_id: S.String(),
      sender: S.Query({
        collectionName: "users" as const,
        where: [["id", "=", "$sender_id"]],
      }),
      text: S.String(),
      created_at: S.String({ default: S.Default.now() }),
      likes: S.Set(S.String()),
      convo: S.Query({
        collectionName: "conversations" as const,
        where: [["id", "=", "$conversationId"]],
      }),
    }),
    rules: {
      read: {
        inConvo: {
          filter: [["convo.members", "=", "$SESSION_USER_ID"]],
        },
      },
    },
  },
  conversations: {
    schema: S.Schema({
      id: S.Id(),
      name: S.String(),
      members: S.Set(S.String()),
      membersInfo: S.Query({
        collectionName: "users" as const,
        where: [["id", "in", "$members"]],
      }),
    }),
    rules: {
      read: {
        isMember: {
          filter: [["members", "=", "$SESSION_USER_ID"]],
        },
      },
    },
  },

  credentials: {
    schema: S.Schema({
      id: S.Id(),
      userId: S.String(),
      username: S.String({ nullable: true, default: null }),
      password: S.String({ nullable: true, default: null }),
    }),
  },
  /* users, sessions, verificationTokens, and accounts are models defined by
   * NextAuth.js (https://authjs.dev/getting-started/adapters#models).
   *
   * We include one oauth provider in this template, github, which uses the
   * accounts model and then links to the users model.
   *
   * The template uses JWT in-memory sessions and does not support passwordless
   * login, but we include the sessions and verificationTokens models for
   * completeness
   */
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
} satisfies Models<any, any>

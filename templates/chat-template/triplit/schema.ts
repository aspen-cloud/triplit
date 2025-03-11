import { Models, Roles, Schema as S } from "@triplit/client"

export const roles: Roles = {
  user: {
    match: {
      "x-triplit-user-id": "$userId",
    },
  },
}

export const schema = S.Collections({
  messages: {
    schema: S.Schema({
      id: S.Id(),
      conversationId: S.String(),
      // TODO: camel case
      sender_id: S.String(),
      text: S.String(),
      // TODO: this can be date
      created_at: S.String({ default: S.Default.now() }),
      likes: S.Optional(S.Set(S.String())),
    }),
    relationships: {
      sender: S.RelationById("users", "$sender_id"),
      reactions: S.RelationMany("reactions", {
        where: [["messageId", "=", "$id"]],
      }),
      convo: S.RelationById("conversations", "$conversationId"),
    },
    permissions: {
      user: {
        read: {
          // You may only read messages in conversations you are a member of
          filter: [["convo.members", "=", "$role.userId"]],
        },
        insert: {
          // You may only author your own message and must be a member of the conversation
          filter: [
            ["convo.members", "=", "$role.userId"],
            ["sender_id", "=", "$role.userId"],
          ],
        },
      },
    },
  },
  conversations: {
    schema: S.Schema({
      id: S.Id(),
      name: S.String(),
      members: S.Set(S.String(), { default: S.Default.Set.empty() }),
    }),
    relationships: {
      membersInfo: S.RelationMany("users", {
        where: [["id", "in", "$members"]],
      }),
    },
    permissions: {
      user: {
        read: {
          // You may only read conversations you are a member of
          filter: [["members", "=", "$role.userId"]],
        },
        insert: {
          // You may only create a conversation you are a member of it
          filter: [["members", "=", "$role.userId"]],
        },
        update: {
          // You may only update a conversation you are a member of it
          filter: [["members", "=", "$role.userId"]],
        },
      },
    },
  },
  reactions: {
    schema: S.Schema({
      id: S.Id(),
      createdAt: S.Date({ default: S.Default.now() }),
      messageId: S.String(),
      userId: S.String(),
      emoji: S.String(),
    }),
    relationships: {
      message: S.RelationById("messages", "$messageId"),
    },
    permissions: {
      user: {
        read: {
          // You may only read reactions to messages you are a member of
          filter: [["message.convo.members", "=", "$role.userId"]],
        },
        insert: {
          // You may only react to messages in conversations you are a member of
          filter: [
            ["message.convo.members", "=", "$role.userId"],
            ["userId", "=", "$role.userId"],
          ],
        },
        delete: {
          // You may only delete your own reactions
          filter: [
            ["message.convo.members", "=", "$role.userId"],
            ["userId", "=", "$role.userId"],
          ],
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
    permissions: {},
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
    relationships: {
      conversations: S.RelationMany("conversations", {
        where: [["members", "contains", "$id"]],
      }),
    },
    permissions: {
      user: {
        // For the sake of demo, allow all users to read all users
        read: {
          filter: [true],
        },
      },
    },
  },
  accounts: {
    schema: S.Schema({
      id: S.Id(),
      userId: S.String(),
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
    relationships: {
      user: S.RelationById("users", "$userId"),
    },
    permissions: {},
  },
  sessions: {
    schema: S.Schema({
      id: S.Id(),
      userId: S.String(),
      expires: S.Date(),
      sessionToken: S.String(),
    }),
    relationships: {
      user: S.RelationById("users", "$userId"),
    },
    permissions: {},
  },
  verificationTokens: {
    schema: S.Schema({
      id: S.Id(),
      identifier: S.String(),
      token: S.String(),
      expires: S.Date(),
    }),
    permissions: {},
  },
})

import { test, expect, describe } from 'vitest';
import { ClientSchema, TriplitClient } from '@triplit/client';
import { Server as TriplitServer } from '@triplit/server-core';
import { DB, Schema as S } from '@triplit/db';
import { createTestClient, SERVICE_KEY } from '../utils/client.js';
import { pause } from '../utils/async.js';
import { setTimeout } from 'timers/promises';
import { areChangesEmpty } from '@triplit/db/changes-buffer';

/**
 * This test simulates a messaging app with 4 connected clients that each send
 * a bunch of different operations (messages, reactions, etc.) to each other.
 * It ensures that all clients converge to the same state after all operations
 * are applied.
 */
describe('ensure clients all converge after operations', async () => {
  const schema = {
    conversations: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
        createdAt: S.Date(),
        memberIds: S.Set(S.String()),
      }),
      relationships: {
        latestMessage: S.RelationOne('messages', {
          where: [['conversationId', '=', '$id']],
          order: [['createdAt', 'DESC']],
        }),
      },
    },
    messages: {
      schema: S.Schema({
        id: S.Id(),
        conversationId: S.String(),
        senderId: S.String(),
        text: S.String(),
        createdAt: S.Date(),
      }),
      relationships: {
        likes: S.RelationMany('reactions', {
          where: [['messageId', '=', '$id']],
        }),
      },
    },
    reactions: {
      schema: S.Schema({
        id: S.Id(),
        messageId: S.String(),
        senderId: S.String(),
        reaction: S.String(),
      }),
    },
  } satisfies ClientSchema;
  const serverDb = new DB({ schema: { collections: schema } });
  const server = new TriplitServer(serverDb);
  const NUM_CLIENTS = 4;
  const indexToClientId = (i: number) => `client-${i}`;
  const clients = Array.from({ length: NUM_CLIENTS }, (_, i) =>
    createTestClient(server, {
      schema,
      clientId: `client-${i}`,
      token: SERVICE_KEY,
      autoConnect: true,
    })
  );
  const firstClient = clients[0];
  const queries = {
    clientsConversations: (clientId: string) =>
      firstClient.query('conversations').Where('memberIds', 'has', clientId),
    clientsMessages: (clientId: string) =>
      firstClient.query('messages').Where('senderId', '=', clientId),
    clientConversationsWithLatestMessage: (clientId: string) =>
      queries
        .clientsConversations(clientId)
        .Include('latestMessage')
        .Order('latestMessage.createdAt', 'DESC'),
    // This is very flakey for some reason
    likedMessages: (clientId: string) =>
      firstClient.query('messages').Where('likes.id', 'isDefined', true),
    conversationsThatHaveNamesWith2: () =>
      firstClient.query('conversations').Where('name', 'like', '%2%'),
  };
  const NUM_OPERATIONS = 100;

  // Expect all clients to be connected
  await pause();
  for (const client of clients) {
    expect(client.connectionStatus).toBe('OPEN');
  }

  // Subscribe to queries
  clients.forEach((client, i) => {
    const clientId = indexToClientId(i);
    for (const query of Object.values(queries)) {
      client.subscribe(query(clientId), (changes) => {
        // console.log(`Client ${clientId} received changes:`, changes);
      });
    }
  });
  await Promise.all(
    clients.map((client, i) =>
      runOperationsAsync(client, indexToClientId(i), NUM_OPERATIONS)
    )
  );
  await pause(500);

  // expect all outboxes to be empty for each client
  for (const client of clients) {
    // TODO figure out how to get around clearing the outbox
    await client.db.entityStore.doubleBuffer.clear(client.db.kv);
    const outboxChanges = await client.db.entityStore.doubleBuffer.getChanges(
      client.db.kv
    );
    expect(areChangesEmpty(outboxChanges)).toBeTruthy();
  }

  test.each(Object.entries(queries))('Query: %s', async (queryName, query) => {
    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];
      const clientQuery = query(indexToClientId(i));
      const serverResult = await serverDb.fetch(clientQuery);
      // console.dir(
      //   {
      //     ['server_' + queryName]: serverResult,
      //   },
      //   { depth: 10 }
      // );
      const clientResult = await client.fetch(clientQuery, {
        policy: 'local-only',
      });
      expect(clientResult).toEqual(serverResult);
    }
  });
});

async function runOperationsAsync(
  client: TriplitClient,
  clientId: string,
  numOperations: number
) {
  for (let op of genRandomOperations(clientId, numOperations)) {
    await setTimeout(Math.floor(Math.random() * 10));
    const { type, collection, data } = op;
    if (type === 'create') {
      if (collection === 'conversations') {
        await client.insert('conversations', data);
      } else if (collection === 'messages') {
        await client.insert('messages', data);
      } else if (collection === 'reactions') {
        await client.insert('reactions', data);
      }
    } else if (type === 'delete') {
      if (collection === 'conversations') {
        await client.delete('conversations', data.id);
      } else if (collection === 'messages') {
        await client.delete('messages', data.id);
      } else if (collection === 'reactions') {
        await client.delete('reactions', data.id);
      }
    } else if (type === 'update') {
      const { id, ...updateData } = data;
      await client.update(collection, id, updateData);
    }
  }
}

/**
 * This will generate a random operation that's either
 * - create or delete a conversation
 * - update a conversation name
 * - create or delete a message
 * - create or delete a reaction
 *
 * Internally it tracks the state of the conversations and messages so that it
 * can create sensible operations like only deleting or updating conversations that exist
 *
 * It will also favor creating messages and reactions over deleting them or conversation operations
 */
function* genRandomOperations(
  clientId: string,
  n: number
): Generator<{
  type: 'create' | 'delete' | 'update';
  collection: 'conversations' | 'messages' | 'reactions';
  data: any;
}> {
  const conversations = new Set<string>();
  const messages = new Set<string>();
  const reactions = new Set<string>();
  for (let i = 0; i < n; i++) {
    const roll = Math.random() * 1.4;
    if (roll < 0.2 || conversations.size === 0) {
      // Create a conversation
      const id = crypto.randomUUID();
      conversations.add(id);
      yield {
        type: 'create',
        collection: 'conversations',
        data: {
          id,
          name: `Conversation ${id}`,
          createdAt: new Date(),
          memberIds: new Set([]),
        },
      };
      continue;
    } else if (roll < 0.4 && conversations.size > 0) {
      // Delete a conversation
      const id =
        Array.from(conversations)[
          Math.floor(Math.random() * conversations.size)
        ];
      conversations.delete(id);
      yield {
        type: 'delete',
        collection: 'conversations',
        data: { id },
      };
      continue;
    } else if (roll < 0.6 && conversations.size > 0) {
      // Update a conversation name
      const id =
        Array.from(conversations)[
          Math.floor(Math.random() * conversations.size)
        ];
      yield {
        type: 'update',
        collection: 'conversations',
        data: { id, name: `Updated Conversation ${id}` },
      };
      continue;
    } else if (roll < 0.8) {
      // Create a message
      const conversationId =
        Array.from(conversations)[
          Math.floor(Math.random() * conversations.size)
        ];
      const id = crypto.randomUUID();
      messages.add(id);
      yield {
        type: 'create',
        collection: 'messages',
        data: {
          id,
          conversationId,
          senderId: clientId,
          text: `Message ${id}`,
          createdAt: new Date(),
        },
      };
      continue;
    } else if (roll < 1.0 && messages.size > 0) {
      // Delete a message
      const id =
        Array.from(messages)[Math.floor(Math.random() * messages.size)];
      messages.delete(id);
      yield {
        type: 'delete',
        collection: 'messages',
        data: { id },
      };
      continue;
    } else if (roll < 1.2 && messages.size > 0) {
      // Create a reaction
      const messageId =
        Array.from(messages)[Math.floor(Math.random() * messages.size)];
      const id = crypto.randomUUID();
      reactions.add(id);
      yield {
        type: 'create',
        collection: 'reactions',
        data: {
          id,
          messageId,
          senderId: clientId,
          reaction: `Reaction ${id}`,
        },
      };
      continue;
    } else if (roll < 1.4 && reactions.size > 0) {
      // Delete a reaction
      const id =
        Array.from(reactions)[Math.floor(Math.random() * reactions.size)];
      reactions.delete(id);
      yield {
        type: 'delete',
        collection: 'reactions',
        data: { id },
      };
      continue;
    }
  }
}

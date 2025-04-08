import { expect, describe, test, vi } from 'vitest';
import { deterministicShuffle } from './utils/seeding.js';
import { DB } from '../src/db.js';
import { pause } from './utils/async.js';
import { CollectionQuery } from '../src/query/types/index.js';

describe.skip('IVM vs Fetch', () => {
  const TODAY = new Date('2024-01-01').getTime();
  const USERS = ['alice', 'bob', 'charlie'];
  const CONVERSATIONS = ['conv1', 'conv2', 'conv3'];

  const QUERIES: Record<string, CollectionQuery> = {
    aliceMessages: {
      collectionName: 'messages',
      where: [
        {
          exists: {
            collectionName: 'conversationMembers',
            where: [
              ['conversationId', '=', '$1.conversationId'],
              ['userId', '=', 'alice'],
            ],
          },
        },
      ],
    },
    allMessages: {
      collectionName: 'messages',
      where: [],
    },
    conversationsWithMostRecentMessage: {
      collectionName: 'conversations',
      where: [],
      include: {
        mostRecentMessage: {
          subquery: {
            collectionName: 'messages',
            where: [['conversationId', '=', '$1.id']],
            order: [
              ['sentAt', 'DESC'],
              // ID is added for tiebreaks between messages with the same sentAt
              ['id', 'ASC'],
            ],
            limit: 1,
          },
          cardinality: 'one',
        },
      },
    },
    threeMostRecentMessages: {
      collectionName: 'messages',
      where: [],
      order: [
        ['sentAt', 'DESC'],
        // ID is added for tiebreaks between messages with the same sentAt
        ['id', 'ASC'],
      ],
      limit: 3,
    },
    aliceConversations: {
      collectionName: 'conversations',
      where: [
        {
          exists: {
            collectionName: 'conversationMembers',
            where: [
              ['conversationId', '=', '$1.id'],
              ['userId', '=', 'alice'],
            ],
          },
        },
      ],
    },
    messagesInTheLastDay: {
      collectionName: 'messages',
      where: [['sentAt', '>', TODAY - 24 * 60 * 60 * 1000]],
    },
    messagesByConversationByDate: {
      collectionName: 'messages',
      where: [],
      order: [
        ['conversationId', 'ASC'],
        ['sentAt', 'ASC'],
        // ID is added for tiebreaks between messages with the same sentAt
        ['id', 'ASC'],
      ],
    },
  };
  const randomEntityFactory = {
    messages: (seed: number) => ({
      id: seed.toString(),
      conversationId: 'conv1',
      text: `Message ${seed}`,
      sentAt: TODAY - ((7 * seed) % 7) * 1000,
    }),
    conversationMembers: (seed: number) => ({
      id: seed.toString(),
      conversationId: CONVERSATIONS[seed % CONVERSATIONS.length],
      userId: USERS[seed % USERS.length],
    }),
    conversations: (seed: number) => ({
      id: CONVERSATIONS[seed % CONVERSATIONS.length],
    }),
  };

  function createRandomOpsForCollection(
    collectionName: string,
    numOps: number,
    seed: number
  ) {
    const ops: EntityOperation[] = [];
    const aliveEntities: string[] = [];
    for (let i = 0; i < numOps; i++) {
      const deterministicRandomValueForOp = (seed * 9301 + 49297 * i) % 233280;
      const op =
        aliveEntities.length === 0
          ? 'insert'
          : // Making inserts and updates more likely than deletes
            ['insert', 'insert', 'update', 'update', 'delete'][
              deterministicRandomValueForOp % 6
            ];

      if (op === 'delete') {
        ops.push({
          type: 'delete',
          collection: collectionName,
          id: aliveEntities.shift()!,
        });
      } else if (op === 'update') {
        const id =
          aliveEntities[deterministicRandomValueForOp % aliveEntities.length];
        const { id: _, ...value } = randomEntityFactory[collectionName](
          deterministicRandomValueForOp
        );
        ops.push({
          type: 'update',
          collection: collectionName,
          id,
          value,
        });
      } else {
        const randomEntity = randomEntityFactory[collectionName](
          deterministicRandomValueForOp
        );
        ops.push({
          type: 'insert',
          collection: collectionName,
          id: randomEntity.id,
          value: randomEntity,
        });
      }
    }
    return ops;
  }

  const RANDOM_SEEDS = Array.from({ length: 5 }, (_, i) =>
    Math.floor(Math.random() * 10_000)
  );

  describe.each(RANDOM_SEEDS)('seed %i', (seed: number) => {
    describe.each(['small', 'medium', 'large'])('database size: %s', (size) => {
      test.each(Object.keys(QUERIES))('Query: %s', async (queryKey) => {
        const query = QUERIES[queryKey];
        const db = new DB();

        const INITIAL_MESSAGES_COUNT = [10, 100, 10_000][
          size === 'small' ? 0 : size === 'medium' ? 1 : 2
        ];
        const INITIAL_CONVERSATIONS_COUNT = [3, 30, 300][
          size === 'small' ? 0 : size === 'medium' ? 1 : 2
        ];
        const INITIAL_CONVERSATION_MEMBERS_COUNT = [3, 30, 300][
          size === 'small' ? 0 : size === 'medium' ? 1 : 2
        ];
        await db.transact(async (tx) => {
          for (let i = 0; i < INITIAL_CONVERSATIONS_COUNT; i++) {
            await tx.insert(
              'conversations',
              randomEntityFactory['conversations'](seed + i)
            );
          }
          for (let i = 0; i < INITIAL_CONVERSATION_MEMBERS_COUNT; i++) {
            await tx.insert(
              'conversationMembers',
              randomEntityFactory['conversationMembers'](seed + i)
            );
          }
          for (let i = 0; i < INITIAL_MESSAGES_COUNT; i++) {
            await tx.insert(
              'messages',
              randomEntityFactory['messages'](seed + i)
            );
          }
        });

        const NUM_OPS = 500;
        const randomOps = deterministicShuffle(
          [
            ...createRandomOpsForCollection('messages', NUM_OPS, seed),
            ...createRandomOpsForCollection(
              'conversationMembers',
              NUM_OPS,
              seed
            ),
            ...createRandomOpsForCollection('conversations', NUM_OPS, seed),
          ],
          seed
        );
        const flushChangesFrequency = [1, 2, 10, 100][seed % 4];
        // const flushChangesFrequency = 1;

        db.subscribe(query, async () => {
          // do nothing
        });

        let i = 0;
        let samples = 0;
        let avgFreshFetchTime = 0;
        let avgViewUpdateTime = 0;
        for (const op of randomOps) {
          if (op.type === 'insert') {
            await db.insert(op.collection!, op.value);
          } else if (op.type === 'update') {
            await db.update(op.collection!, op.id, op.value);
          } else {
            await db.delete(op.collection!, op.id);
          }
          i++;
          if (i % flushChangesFrequency === 0) {
            const freshFetchStart = performance.now();
            const results = await db.fetch(query);
            const freshFetchEnd = performance.now();
            const freshFetchTime = freshFetchEnd - freshFetchStart;
            avgFreshFetchTime =
              (avgFreshFetchTime * samples + freshFetchTime) / (samples + 1);

            const viewUpdateStart = performance.now();
            await db.updateQueryViews();
            const viewUpdateEnd = performance.now();
            const viewUpdateTime = viewUpdateEnd - viewUpdateStart;
            avgViewUpdateTime =
              (avgViewUpdateTime * samples + viewUpdateTime) / (samples + 1);

            samples++;
            if (samples >= 10) {
              break;
            }
          }
        }
        const faster =
          avgFreshFetchTime < avgViewUpdateTime ? 'freshFetch' : 'viewUpdate';
        const percentage =
          (Math.abs(avgFreshFetchTime - avgViewUpdateTime) /
            Math.max(avgFreshFetchTime, avgViewUpdateTime)) *
          100;
        console.log(
          `${faster} is faster by ${percentage.toFixed(2)}% (avgFreshFetchTime: ${avgFreshFetchTime.toFixed(2)}ms, avgViewUpdateTime: ${avgViewUpdateTime.toFixed(2)}ms, updateFrequency: ${flushChangesFrequency})`
        );
        expect(avgViewUpdateTime).toBeLessThan(avgFreshFetchTime);
        // expect(spy).toHaveBeenCalledTimes(expectedNumberOfCalls);
      });
    });
  });

  // These tests are relevant for bulk inserts and initial syncing of queries to the client
  describe('IVM large updates', () => {
    test('can handle a large changeset for a relational query', async () => {
      const db = new DB({
        ivmOptions: { shouldTrackChanges: false },
      });
      const NUM_CONVERSATIONS = 100;
      const NUM_MESSAGES = 1000;
      const NUM_CONVERSATION_MEMBERS = 10;

      // conversations with most recent message and all members included
      const query = {
        collectionName: 'conversations',
        where: [],
        include: {
          mostRecentMessage: {
            subquery: {
              collectionName: 'messages',
              where: [['conversationId', '=', '$1.id']],
              order: [
                ['sentAt', 'DESC'],
                // ID is added for tiebreaks between messages with the same sentAt
                ['id', 'ASC'],
              ],
              limit: 1,
            },
            cardinality: 'one',
          },
          members: {
            subquery: {
              collectionName: 'conversationMembers',
              where: [['conversationId', '=', '$1.id']],
            },
            cardinality: 'many',
          },
        },
      };

      db.subscribe(query, async () => {});

      // These are essentially the queries the VAC would set up for the relational query
      // The important bit is each query is non-relational
      const VIEW_QUERIES = [
        {
          collectionName: 'conversations',
          where: [],
        },
        {
          collectionName: 'messages',
          where: [],
          order: [
            ['conversationId', 'ASC'],
            ['sentAt', 'ASC'],
          ],
        },
        {
          collectionName: 'conversationMembers',
          where: [],
          order: [['conversationId', 'ASC']],
        },
      ];

      // for (const viewQuery of VIEW_QUERIES) {
      //   db.subscribe(viewQuery, async () => {});
      // }

      const conversations = Array.from({ length: NUM_CONVERSATIONS }, (_, i) =>
        randomEntityFactory['conversations'](i)
      );
      const conversationMembers = Array.from(
        { length: NUM_CONVERSATION_MEMBERS },
        (_, i) => randomEntityFactory['conversationMembers'](i)
      );
      const messages = Array.from({ length: NUM_MESSAGES }, (_, i) =>
        randomEntityFactory['messages'](i)
      );

      await db.transact(async (tx) => {
        for (const conversation of conversations) {
          await tx.insert('conversations', conversation);
        }
        for (const member of conversationMembers) {
          await tx.insert('conversationMembers', member);
        }
        for (const message of messages) {
          await tx.insert('messages', message);
        }
      });

      const freshFetchStart = performance.now();
      const results = await db.fetch(query);
      const freshFetchEnd = performance.now();
      const freshFetchTime = freshFetchEnd - freshFetchStart;
      console.log(`Fresh fetch time: ${freshFetchTime.toFixed(2)}ms`);

      const viewUpdateStart = performance.now();
      await db.updateQueryViews();
      const viewUpdateEnd = performance.now();
      const viewUpdateTime = viewUpdateEnd - viewUpdateStart;
      console.log(`View update time: ${viewUpdateTime.toFixed(2)}ms`);

      expect(viewUpdateTime).toBeLessThan(freshFetchTime);
    });
  });
});

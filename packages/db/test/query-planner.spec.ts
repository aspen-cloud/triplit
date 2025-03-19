import { describe, expect, test } from 'vitest';
import {
  compileQuery,
  compileRelationalPlan,
  extractViews,
} from '../src/query-planner/query-compiler.js';
import { CollectionQuery } from '../src/query.js';

describe('query planning', async () => {
  const queries: {
    description: string;
    query: CollectionQuery;
  }[] = [
    {
      description: "Posts authored by user with username 'Bob99'",
      query: {
        collectionName: 'posts',
        where: [
          {
            exists: {
              collectionName: 'users',
              where: [
                ['id', '=', '$1.authorId'],
                ['username', '=', 'Bob99'],
              ],
            },
          },
        ],
      },
    },
    {
      description: 'messages from conversations that the user is part of',
      query: {
        collectionName: 'messages',
        where: [
          {
            exists: {
              collectionName: 'conversations',
              where: [
                ['id', '=', '$1.conversationId'],
                {
                  exists: {
                    collectionName: 'conversation_members',
                    where: [
                      ['conversationId', '=', '$1.id'],
                      ['userId', '=', 'user123'],
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      description: 'Conversations including the most recent message and sender',
      query: {
        collectionName: 'conversations',
        include: {
          latestMessage: {
            subquery: {
              collectionName: 'messages',
              where: [['conversationId', '=', '$1.id']],
              order: [['timestamp', 'DESC']],
              include: {
                sender: {
                  subquery: {
                    collectionName: 'users',
                    where: [['id', '=', '$1.senderId']],
                  },
                  cardinality: 'one',
                },
              },
            },
            cardinality: 'one',
          },
        },
      },
    },
    {
      description: 'Messages and the reactions',
      query: {
        collectionName: 'messages',
        include: {
          reactions: {
            subquery: {
              collectionName: 'reactions',
              where: [['messageId', '=', '$1.id']],
            },
            cardinality: 'many',
          },
        },
      },
    },
    {
      description: '20 most recent messages in a conversation',
      query: {
        collectionName: 'messages',
        where: [['conversationId', '=', 'conv123']],
        order: [['timestamp', 'DESC']],
        limit: 20,
      },
    },
    {
      description: 'Flights to california including the destination airports',
      query: {
        collectionName: 'flights',
        where: [
          {
            exists: {
              collectionName: 'airports',
              where: [
                ['id', '=', '$1.destination'],
                ['state', '=', 'CA'],
              ],
            },
          },
        ],
        include: {
          destinationAirport: {
            subquery: {
              collectionName: 'airports',
              where: [
                ['id', '=', '$1.destination'],
                ['state', '=', 'CA'],
              ],
            },
            cardinality: 'one',
          },
        },
      },
    },
    {
      description: 'Benchmarks query',
      query: {
        collectionName: 'branches',
        include: {
          latest_run: {
            subquery: {
              collectionName: 'runs',
              select: ['created_at'],
              order: [['created_at', 'DESC']],
              where: [['branch_name', '=', '$1.id']],
            },
            cardinality: 'one',
          },
          benchmarks: {
            subquery: {
              collectionName: 'benchmarks',
              select: ['id', 'name'],
              include: {
                latest_branch_run: {
                  subquery: {
                    collectionName: 'runs',
                    select: ['results', 'created_at'],
                    order: [['created_at', 'DESC']],
                    where: [
                      ['benchmark', '=', '$1.id'],
                      ['branch_name', '=', '$2.id'],
                    ],
                  },
                  cardinality: 'one',
                },
              },
            },
            cardinality: 'many',
          },
        },
      },
    },
    {
      description: 'Posts ordered by the last name of the author',
      query: {
        collectionName: 'posts',
        order: [
          [
            'author.name',
            'ASC',
            {
              subquery: {
                collectionName: 'users',
                where: [['id', '=', '$1.authorId']],
              },
              cardinality: 'one',
            },
          ],
        ],
      },
    },
    {
      description: 'subquery with two filters with variables',
      query: {
        collectionName: 'messages',
        where: [
          {
            exists: {
              collectionName: 'users',
              where: [
                ['id', '=', '$1.senderId'],
                ['name', '=', '$1.text'],
              ],
            },
          },
        ],
      },
    },
  ];

  test.each(queries)('query: $description', async ({ query }) => {
    const plan = compileQuery(query, undefined);
    expect(plan).toMatchSnapshot();
  });
});

function printInAsciiBox(text: string) {
  const lines = text.split('\n');
  const maxLength = Math.max(...lines.map((line) => line.length));
  const horizontalBorder = '─'.repeat(maxLength + 2);
  console.log(`┌${horizontalBorder}┐`);
  for (const line of lines) {
    console.log(`│ ${line.padEnd(maxLength)} │`);
  }
  console.log(`└${horizontalBorder}┘`);
}

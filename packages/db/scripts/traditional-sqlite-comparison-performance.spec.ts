import { Schema as S } from '../src/schema/builder.js';
import { DB, DBSchema } from '../src/db.ts';
import { BTreeKVStore } from '../src/kv-store/storage/memory-btree.js';
import { SQLiteKVStore } from '../src/kv-store/storage/sqlite.js';
import { LmdbKVStore } from '../src/kv-store/storage/lmdb.js';
import sqlite from 'better-sqlite3';
import fs from 'node:fs';
// import { SqliteWorkerKvStore } from '../src/kv-store/storage/sqlite-worker.ts';
import { SqliteWorkerKvStore } from '../dist/kv-store/storage/sqlite-worker.js';

const QUERY_NAMES = [
  'CONVERSATIONS_WITH_LAST_MESSAGE_AND_UNREAD_COUNT',
  'CHAT_WITH_LAST_20_MESSAGES_AND_SENDER',
  'UNREAD_MESSAGES_WITH_CONVO_AND_SENDER',
  'ALL_MESSAGES',
];

const QUERIES_TO_RUN: (typeof QUERY_NAMES)[number][] = [
  // 'CONVERSATIONS_WITH_LAST_MESSAGE_AND_UNREAD_COUNT',
  'CHAT_WITH_LAST_20_MESSAGES_AND_SENDER',
  // 'UNREAD_MESSAGES_WITH_CONVO_AND_SENDER',
];
// const QUERIES_TO_RUN: (typeof QUERY_NAMES)[number][] = ['ALL_MESSAGES'];
// const QUERIES_TO_RUN = QUERY_NAMES;

const NUM_OPS = 1_000;
const INITIAL_MESSAGES_COUNT = 5_000;

const USERS = [
  { id: '1', name: 'Alice' },
  { id: '2', name: 'Bob' },
  { id: '3', name: 'Charlie' },
  { id: '4', name: 'David' },
  { id: '5', name: 'Eve' },
  { id: '6', name: 'Frank' },
  { id: '7', name: 'Grace' },
  { id: '8', name: 'Heidi' },
  { id: '9', name: 'Ivan' },
  { id: '10', name: 'Judy' },
];

const CONVERSATIONS = [
  {
    id: '1',
    name: 'General',
    created_at: '2023-01-01 10:00:00',
    members: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  },
  {
    id: '2',
    name: 'Random',
    created_at: '2023-01-02 11:00:00',
    members: [1, 4, 5],
  },
  {
    id: '3',
    name: 'Development',
    created_at: '2023-01-03 12:00:00',
    members: [2, 3, 6],
  },
  {
    id: '4',
    name: 'Design',
    created_at: '2023-01-04 13:00:00',
    members: [4, 5, 7],
  },
  {
    id: '5',
    name: 'Marketing',
    created_at: '2023-01-05 14:00:00',
    members: [6, 7, 8],
  },
  {
    id: '6',
    name: 'Sales',
    created_at: '2023-01-06 15:00:00',
    members: [1, 8, 9, 10],
  },
  {
    id: '7',
    name: 'Support',
    created_at: '2023-01-07 16:00:00',
    members: [1, 2, 3],
  },
  {
    id: '8',
    name: 'HR',
    created_at: '2023-01-08 17:00:00',
    members: [4, 5, 6],
  },
  {
    id: '9',
    name: 'Finance',
    created_at: '2023-01-09 18:00:00',
    members: [1, 7, 8, 9],
  },
  {
    id: '10',
    name: 'Legal',
    created_at: '2023-01-10 19:00:00',
    members: [10, 1, 2],
  },
];

const INITIAL_DATA = {
  USERS,
  CONVERSATIONS,
};

type Operation =
  | {
      name: 'SEND_MESSAGE';
      payload: {
        conversation_id: string;
        sender_id: string;
        content: string;
      };
    }
  | {
      name: 'READ_UNREAD_IN_CONVO';
      payload: {
        conversation_id: string;
        user_id: string;
      };
    };
interface DB_Workload {
  init: (initialData: typeof INITIAL_DATA) => Promise<void>;
  handleOperation: (operation: Operation) => Promise<void>;
  queries: Record<(typeof QUERY_NAMES)[number], any>;
  updateViews: () => Promise<void>;
}

/**
 * This will take a workload and run a set of operations against it and
 * measure the time it takes to run N operations.
 * @param workload
 */
async function testWorkLoad(workload: DB_Workload, name: string) {
  const operations: Operation[] = [];
  await workload.init(INITIAL_DATA);
  for (let i = 0; i < NUM_OPS; i++) {
    const randomUser = Math.floor(Math.random() * USERS.length);
    const randomConversation = Math.floor(Math.random() * CONVERSATIONS.length);
    operations.push({
      name: 'SEND_MESSAGE',
      payload: {
        conversation_id: CONVERSATIONS[randomConversation].id,
        sender_id: USERS[randomUser].id,
        content: `Hello from ${USERS[randomUser].name}`,
      },
    });
    // if (i % 3 === 0) {
    //   operations.push({
    //     name: 'READ_UNREAD_IN_CONVO',
    //     payload: {
    //       conversation_id: CONVERSATIONS[randomConversation].id,
    //       user_id: USERS[randomUser].id,
    //     },
    //   });
    // }
  }
  const start = performance.now();
  let viewUpdateTime = 0;
  let writeTime = 0;
  for (const operation of operations) {
    const writeStart = performance.now();
    await workload.handleOperation(operation);
    const writeEnd = performance.now();
    writeTime += writeEnd - writeStart;
    const viewStart = performance.now();
    await workload.updateViews();
    const viewEnd = performance.now();
    viewUpdateTime += viewEnd - viewStart;
  }
  const end = performance.now();
  const totalTime = end - start;
  const percentUpdatingViews = Math.round((viewUpdateTime / totalTime) * 100);
  // console.log(
  //   `Performed ${NUM_OPS} operations with ${name} in ${totalTime}ms (${percentUpdatingViews}% updating views)`
  // );
  console.log(`${name} finished (${totalTime}ms)`);
  return {
    // name,
    // queries: QUERIES_TO_RUN.join(', '),
    numOps: NUM_OPS,
    totalTime,
    writeTime: `${writeTime}ms (${Math.round((writeTime / totalTime) * 100)}%)`,
    viewUpdateTime: `${viewUpdateTime}ms (${percentUpdatingViews}%)`,
    operationsPerSecond: Math.round((NUM_OPS / totalTime) * 1000),
  };
}

class TriplitWorkload implements DB_Workload {
  private static schema = {
    collections: S.Collections({
      conversations: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
        }),
        relationships: {
          unreadMessages: S.RelationMany('messages', {
            where: [
              ['conversation_id', '=', '$id'],
              ['read_at', '=', null],
            ],
          }),
          latestMessage: S.RelationOne('messages', {
            where: [['conversation_id', '=', '$id']],
            order: [['created_at', 'DESC']],
          }),
        },
      },
      messages: {
        schema: S.Schema({
          id: S.Id(),
          conversation_id: S.String(),
          sender_id: S.String(),
          content: S.String(),
          created_at: S.Date({ default: 'now' }),
          read_at: S.Date({ nullable: true, default: null }),
        }),
        relationships: {
          sender: S.RelationById('users', '$sender_id'),
          conversation: S.RelationById('conversations', '$conversation_id'),
        },
      },
      users: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
        }),
      },
      conversation_members: {
        schema: S.Schema({
          id: S.Id(),
          conversation_id: S.String(),
          user_id: S.String(),
        }),
      },
    }),
  };
  db: DB<(typeof TriplitWorkload.schema)['collections']>;
  queries: Record<(typeof QUERY_NAMES)[number], any>;

  constructor() {
    // const sqliteDb = sqlite(':memory:');
    const sqliteDb = sqlite('./test-triplit.db');
    const sqliteKv = new SQLiteKVStore(sqliteDb);
    // const sqliteKv = new SqliteWorkerKvStore(':memory:');
    this.db = new DB({
      schema: TriplitWorkload.schema,
      kv: sqliteKv,
      ivmOptions: {
        shouldTrackChanges: false,
      },
    });
    this.queries = {
      CONVERSATIONS_WITH_LAST_MESSAGE_AND_UNREAD_COUNT: this.db
        .query('conversations')
        .Include('latestMessage')
        .Include('unreadMessages'),
      CHAT_WITH_LAST_20_MESSAGES_AND_SENDER: this.db
        .query('messages')
        .Where('conversation_id', '=', '1')
        .Include('sender')
        .Order('created_at', 'DESC')
        .Limit(20),
      UNREAD_MESSAGES_WITH_CONVO_AND_SENDER: this.db
        .query('messages')
        .Where('read_at', '=', null)
        .Include('sender')
        .Include('conversation'),
      ALL_MESSAGES: this.db
        .query('messages')
        .Limit(100)
        .Order('created_at', 'DESC'),
    };
  }

  async init(initialData: typeof INITIAL_DATA) {
    await this.db.transact(async (tx) => {
      for (const user of initialData.USERS) {
        await tx.insert('users', user);
      }
      for (const conversation of initialData.CONVERSATIONS) {
        const { id, name, members } = conversation;
        await tx.insert('conversations', { id, name });
        for (const member of members) {
          await tx.insert('conversation_members', {
            conversation_id: conversation.id,
            user_id: member.toString(),
          });
        }
      }
      // Seed messages
      for (let i = 0; i < INITIAL_MESSAGES_COUNT; i++) {
        const randomUser = Math.floor(Math.random() * USERS.length);
        const randomConversation = Math.floor(
          Math.random() * CONVERSATIONS.length
        );
        await tx.insert('messages', {
          conversation_id: CONVERSATIONS[randomConversation].id,
          sender_id: USERS[randomUser].id,
          content: `Initial message ${i} from ${USERS[randomUser].name}`,
          created_at: new Date(),
        });
      }
    });
    for (const queryName of QUERIES_TO_RUN) {
      const query = this.queries[queryName];
      this.db.subscribe(query, (result) => {
        // console.log(queryName, result);
      });
    }
  }

  async handleOperation(operation: Operation) {
    // console.log('op', operation);
    switch (operation.name) {
      case 'SEND_MESSAGE':
        await this.db.transact(async (tx) => {
          const { conversation_id, sender_id, content } = operation.payload;
          await tx.insert('messages', {
            conversation_id,
            sender_id,
            content,
            created_at: new Date(),
          });
        });
        break;
      case 'READ_UNREAD_IN_CONVO':
        await this.db.transact(async (tx) => {
          const { conversation_id, user_id } = operation.payload;
          const unreadMessagesInConvo = await tx.fetch(
            this.db
              .query('messages')
              .Where('conversation_id', '=', conversation_id)
              .Where('read_at', '=', null)
          );
          for (const message of unreadMessagesInConvo) {
            await tx.update('messages', message.id, (msg) => {
              msg.read_at = new Date();
            });
          }
        });
        break;
    }
  }
  async updateViews() {
    await this.db.updateQueryViews();
    this.db.broadcastToQuerySubscribers();
  }
}
/**
 * This is a workload that uses SQLite as the backend.
 * Instead of using subscriptions like Triplit it will instead run each query again
 * from scratch
 */
class SQLiteWorkLoad implements DB_Workload {
  db: sqlite.Database;
  // queries: Record<(typeof QUERY_NAMES)[number], sqlite.Statement>;
  queries: { [key in (typeof QUERY_NAMES)[number]]: sqlite.Statement };
  constructor() {
    const SQLITE_DB_INITIALIZE = `
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY,
    name TEXT
);
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,
    conversation_id INTEGER,
    sender_id INTEGER,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME
   /* FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    FOREIGN KEY (sender_id) REFERENCES users(id) */
);
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT
);
CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id INTEGER,
    user_id INTEGER,
    PRIMARY KEY (conversation_id, user_id)
   /* FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (user_id) REFERENCES users(id) */
);
`;
    // this.db = sqlite(':memory:');
    this.db = sqlite('./test-sqlite.db');
    this.db.exec(SQLITE_DB_INITIALIZE);

    this.queries = {
      CONVERSATIONS_WITH_LAST_MESSAGE_AND_UNREAD_COUNT: this.db.prepare(
        `WITH last_messages AS (
    SELECT m.conversation_id, 
           m.id AS last_message_id, 
           m.content AS last_message_content,
           m.sender_id AS last_message_sender_id,
           m.created_at AS last_message_created_at
    FROM messages m
    WHERE m.id = (
        SELECT MAX(m2.id)
        FROM messages m2
        WHERE m2.conversation_id = m.conversation_id
    )
),
unread_counts AS (
    SELECT m.conversation_id, COUNT(*) AS unread_count
    FROM messages m
    WHERE m.read_at IS NULL 
    GROUP BY m.conversation_id
)
SELECT c.id AS conversation_id,
       c.name AS conversation_name,
       lm.last_message_id,
       lm.last_message_content,
       lm.last_message_sender_id,
       lm.last_message_created_at,
       COALESCE(uc.unread_count, 0) AS unread_count
FROM conversations c
LEFT JOIN last_messages lm ON c.id = lm.conversation_id
LEFT JOIN unread_counts uc ON c.id = uc.conversation_id;
`
      ),
      CHAT_WITH_LAST_20_MESSAGES_AND_SENDER: this.db.prepare(
        `SELECT m.id AS message_id,
       m.content,
       m.created_at,
       m.read_at,
       u.id AS sender_id,
       u.name AS sender_name
FROM messages m
JOIN users u ON m.sender_id = u.id
WHERE m.conversation_id = '1'
ORDER BY m.created_at DESC
LIMIT 20;
`
      ),
      UNREAD_MESSAGES_WITH_CONVO_AND_SENDER: this.db.prepare(
        `SELECT m.id AS message_id,
       m.content,
       m.created_at,
       c.id AS conversation_id,
       c.name AS conversation_name,
       u.id AS sender_id,
       u.name AS sender_name
FROM messages m
JOIN conversations c ON m.conversation_id = c.id
JOIN users u ON m.sender_id = u.id
WHERE m.read_at IS NULL
ORDER BY m.created_at ASC;
`
      ),
      ALL_MESSAGES: this.db.prepare(
        `SELECT * from messages ORDER BY created_at DESC LIMIT 100;`
      ),
    };
  }
  async init(initialData: typeof INITIAL_DATA) {
    for (const user of initialData.USERS) {
      this.db
        .prepare('INSERT INTO users (id, name) VALUES (?, ?)')
        .run(user.id, user.name);
    }
    for (const conversation of initialData.CONVERSATIONS) {
      this.db
        .prepare('INSERT INTO conversations (id, name) VALUES (?, ?)')
        .run(conversation.id, conversation.name);
      for (const member of conversation.members) {
        this.db
          .prepare(
            'INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)'
          )
          .run(conversation.id, member);
      }
    }

    // Seed messages
    for (let i = 0; i < INITIAL_MESSAGES_COUNT; i++) {
      const randomUser = Math.floor(Math.random() * USERS.length);
      const randomConversation = Math.floor(
        Math.random() * CONVERSATIONS.length
      );
      this.db
        .prepare(
          'INSERT INTO messages (conversation_id, sender_id, content, created_at) VALUES (?, ?, ?, ?)'
        )
        .run(
          CONVERSATIONS[randomConversation].id,
          USERS[randomUser].id,
          `Initial message ${i} from ${USERS[randomUser].name}`,
          +new Date()
        );
    }

    // verify data
    // console.log(
    //   'conversations',
    //   this.db.prepare('SELECT * FROM conversations').all()
    // );
    // console.log('users', this.db.prepare('SELECT * FROM users').all());
    // console.log(
    //   'conversation_members',
    //   this.db.prepare('SELECT * FROM conversation_members').all()
    // );
    // console.log('messages', this.db.prepare('SELECT * FROM messages').all());
  }

  async handleOperation(operation: Operation) {
    // console.dir(operation);
    switch (operation.name) {
      case 'SEND_MESSAGE':
        const { conversation_id, sender_id, content } = operation.payload;
        this.db
          .prepare(
            'INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)'
          )
          .run(conversation_id, sender_id, content);
        break;
      case 'READ_UNREAD_IN_CONVO':
        const { conversation_id: convoId, user_id: userId } = operation.payload;
        this.db
          .prepare(
            'UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND read_at IS NULL'
          )
          .run(convoId);
        break;
    }
  }

  async updateViews() {
    for (const queryName of QUERIES_TO_RUN) {
      const query = this.queries[queryName];
      const results = query
        .all()
        .map((row) => ({ ...row, created_at: new Date(row.created_at) }));

      // console.log(results);
    }
  }
}

let inspectorHandle = null;

// process.on('beforeExit', () => {
//   if (inspectorHandle) {
//     inspectorHandle[Symbol.dispose]();
//   }
// })

process.on('SIGINT', () => {
  console.log('Received SIGINT. Cleaning up...');
  // Perform cleanup actions here
  if (inspectorHandle) {
    inspectorHandle[Symbol.dispose]();
  }
  process.exit(0); // Exit gracefully after cleanup
});

async function keepAlive() {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  // console.log('Process is still alive');
  keepAlive(); // Recursive call to keep the process running
}
try {
  // globalThis.runTriplitTest();
  const shouldOpenDevtools = process.argv.includes('--profile');
  if (shouldOpenDevtools) {
    keepAlive();

    const inspector = await import('node:inspector/promises');

    inspectorHandle = inspector.open({});
    const inspectorUrl = inspector.url();
    console.log(`Node inspector listening on ${inspectorUrl}`);

    globalThis.profileTriplitTest = async (shouldProfile = true) => {
      shouldProfile && console.profile();
      await testWorkLoad(new TriplitWorkload(), 'Triplit (durable SQLite)');
      shouldProfile && console.profileEnd();
      // console.log('finished profiling');
    };
  } else {
    const results = {};
    console.log('Testing', QUERIES_TO_RUN);
    {
      const name = 'TRIPLIT (durable SQLite)';
      results[name] = await testWorkLoad(new TriplitWorkload(), name);
    }
    gc();
    {
      const name = 'SQLITE (durable)';
      results[name] = await testWorkLoad(new SQLiteWorkLoad(), name);
    }
    console.table(results);
  }
} finally {
  await cleanUp();
}

async function cleanUp() {
  console.log('Cleaning up...');
  // Delete each sqlite file
  const files = ['./test-sqlite.db', './test-triplit.db'];
  for (const file of files) {
    if (await fs.existsSync(file)) {
      fs.unlinkSync(file);
      console.log(`Deleted ${file}`);
    }
  }
}

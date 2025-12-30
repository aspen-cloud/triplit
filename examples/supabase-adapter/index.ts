/**
 * Example: Using Triplit with Supabase Postgres Adapter
 *
 * This example demonstrates how to set up and use Triplit with Supabase
 * as the storage backend instead of the default KV store.
 *
 * Prerequisites:
 * 1. Create a Supabase project at https://supabase.com
 * 2. Run the SQL migration from packages/db/migrations/supabase-postgres-schema.sql
 * 3. Set environment variables (see .env.example)
 *
 * Install dependencies:
 * npm install @triplit/db @supabase/supabase-js dotenv
 */

import { DB } from '@triplit/db';
import { SupabasePostgresKVStore } from '@triplit/db/storage/supabase-postgres';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

// Validate required environment variables
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  throw new Error(
    'Missing required environment variables: SUPABASE_URL and SUPABASE_KEY'
  );
}

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  {
    auth: {
      persistSession: false, // Server-side usage doesn't need session persistence
    },
  }
);

// Create the Supabase Postgres KV store
const kvStore = new SupabasePostgresKVStore(supabase, {
  // Optional: Specify custom table name
  tableName: process.env.SUPABASE_TABLE_NAME || 'triplit_kv_store',
  // Don't auto-create table in production - use migrations instead
  autoCreateTable: false,
});

// Define your Triplit schema
const schema = {
  collections: {
    users: {
      schema: {
        id: { type: 'string' as const },
        name: { type: 'string' as const },
        email: { type: 'string' as const },
        createdAt: { type: 'date' as const },
      },
    },
    posts: {
      schema: {
        id: { type: 'string' as const },
        title: { type: 'string' as const },
        content: { type: 'string' as const },
        authorId: { type: 'string' as const },
        published: { type: 'boolean' as const },
        createdAt: { type: 'date' as const },
      },
    },
  },
};

// Create Triplit DB instance with Supabase storage
const db = new DB({
  kv: kvStore,
  schema,
});

// Example usage
async function main() {
  console.log('🚀 Triplit with Supabase Postgres Adapter Example\n');

  try {
    // Insert a user
    console.log('📝 Inserting a user...');
    await db.insert('users', {
      id: 'user-1',
      name: 'Alice Johnson',
      email: 'alice@example.com',
      createdAt: new Date(),
    });
    console.log('✅ User inserted\n');

    // Insert a post
    console.log('📝 Inserting a post...');
    await db.insert('posts', {
      id: 'post-1',
      title: 'Hello Triplit with Supabase!',
      content:
        'This post is stored in Postgres via Supabase instead of a local KV store.',
      authorId: 'user-1',
      published: true,
      createdAt: new Date(),
    });
    console.log('✅ Post inserted\n');

    // Query users
    console.log('🔍 Querying all users...');
    const users = await db.fetch(db.query('users').build());
    console.log('Users:', JSON.stringify(users, null, 2));
    console.log('');

    // Query posts
    console.log('🔍 Querying all posts...');
    const posts = await db.fetch(db.query('posts').build());
    console.log('Posts:', JSON.stringify(posts, null, 2));
    console.log('');

    // Query with filters
    console.log('🔍 Querying published posts...');
    const publishedPosts = await db.fetch(
      db.query('posts').where([['published', '=', true]]).build()
    );
    console.log('Published posts:', JSON.stringify(publishedPosts, null, 2));
    console.log('');

    // Update a post
    console.log('📝 Updating a post...');
    await db.update('posts', 'post-1', (entity) => {
      entity.title = 'Updated: Hello Triplit with Supabase!';
    });
    console.log('✅ Post updated\n');

    // Query updated post
    console.log('🔍 Querying updated post...');
    const updatedPosts = await db.fetch(
      db.query('posts').where([['id', '=', 'post-1']]).build()
    );
    console.log('Updated post:', JSON.stringify(updatedPosts, null, 2));
    console.log('');

    // Delete example (commented out to preserve data)
    // console.log('🗑️  Deleting post...');
    // await db.delete('posts', 'post-1');
    // console.log('✅ Post deleted\n');

    console.log('✅ Example completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the example
main();

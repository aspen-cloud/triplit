/**
 * Example: Using Triplit with Supabase SQL Adapter
 *
 * This example demonstrates the NEW SQL adapter that:
 * - Uses actual Postgres tables instead of a KV store
 * - Translates Triplit queries to SQL queries
 * - Supports schema introspection from existing databases
 * - Can run migrations to create tables from Triplit schemas
 *
 * Prerequisites:
 * 1. Create a Supabase project at https://supabase.com
 * 2. Run the SQL setup from packages/db/migrations/supabase-sql-adapter-setup.sql
 * 3. Set environment variables (see .env.example)
 *
 * Install dependencies:
 * npm install @triplit/db @supabase/supabase-js dotenv
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { SupabaseSQLAdapter } from '@triplit/db/sql/supabase-sql-adapter';

// Load environment variables
config();

// Validate required environment variables
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  throw new Error(
    'Missing required environment variables: SUPABASE_URL and SUPABASE_KEY'
  );
}

// Create Supabase client with service role key (required for RPC functions)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY, // Use service role key, not anon key
  {
    auth: {
      persistSession: false,
    },
  }
);

// ============================================================================
// EXAMPLE 1: Using an Existing Postgres Database
// ============================================================================

async function exampleIntrospection() {
  console.log('\n📊 EXAMPLE 1: Schema Introspection from Existing Database\n');
  console.log('='.repeat(70));

  // Create adapter without a schema - it will introspect the database
  const adapter = new SupabaseSQLAdapter(supabase, undefined, {
    debug: true,
  });

  // Introspect existing database schema
  console.log('\n🔍 Introspecting database schema...');
  const introspectedSchema = await adapter.introspectSchema();

  console.log('\n📋 Discovered Collections:');
  for (const [collectionName, collection] of Object.entries(
    introspectedSchema.collections
  )) {
    console.log(`\n  Collection: ${collectionName}`);
    console.log(`  Fields:`);
    for (const [fieldName, fieldSchema] of Object.entries(collection.schema)) {
      console.log(`    - ${fieldName}: ${JSON.stringify(fieldSchema)}`);
    }
  }

  // Now you can query existing tables
  if (introspectedSchema.collections['users']) {
    console.log('\n🔍 Querying users table...');
    const users = await adapter.fetch({
      collectionName: 'users',
    });
    console.log(`Found ${users.length} users`);
  }
}

// ============================================================================
// EXAMPLE 2: Define Schema and Run Migrations
// ============================================================================

async function exampleMigrations() {
  console.log('\n\n🏗️  EXAMPLE 2: Schema Definition and Migrations\n');
  console.log('='.repeat(70));

  // Define Triplit schema
  const schema = {
    collections: {
      posts: {
        schema: {
          id: { type: 'string' as const },
          title: { type: 'string' as const },
          content: { type: 'string' as const },
          authorId: { type: 'string' as const },
          published: { type: 'boolean' as const },
          tags: {
            type: 'set' as const,
            items: { type: 'string' as const },
          },
          metadata: { type: 'json' as const },
          createdAt: { type: 'date' as const },
          updatedAt: { type: 'date' as const },
        },
      },
      authors: {
        schema: {
          id: { type: 'string' as const },
          name: { type: 'string' as const },
          email: { type: 'string' as const },
          bio: { type: 'string' as const, config: { nullable: true } },
          createdAt: { type: 'date' as const },
        },
      },
      comments: {
        schema: {
          id: { type: 'string' as const },
          postId: { type: 'string' as const },
          authorId: { type: 'string' as const },
          content: { type: 'string' as const },
          createdAt: { type: 'date' as const },
        },
      },
    },
    version: 0,
  };

  // Create adapter with schema and auto-migrate
  console.log('\n📝 Creating adapter with schema...');
  const adapter = new SupabaseSQLAdapter(supabase, schema, {
    debug: true,
    autoMigrate: true, // This will create tables automatically
  });

  console.log('\n✅ Tables created from schema!');
  console.log(
    '\nYou can now query these tables using Triplit query syntax,'
  );
  console.log('and they will be translated to optimized SQL queries.');
}

// ============================================================================
// EXAMPLE 3: Querying with the SQL Adapter
// ============================================================================

async function exampleQuerying() {
  console.log('\n\n🔍 EXAMPLE 3: Querying with SQL Translation\n');
  console.log('='.repeat(70));

  const schema = {
    collections: {
      posts: {
        schema: {
          id: { type: 'string' as const },
          title: { type: 'string' as const },
          content: { type: 'string' as const },
          status: { type: 'string' as const },
          views: { type: 'number' as const },
          createdAt: { type: 'date' as const },
        },
      },
    },
    version: 0,
  };

  const adapter = new SupabaseSQLAdapter(supabase, schema, {
    debug: true,
  });

  // Insert some test data
  console.log('\n📝 Inserting test data...');
  await adapter.insertEntity('posts', {
    id: 'post-1',
    title: 'First Post',
    content: 'Hello from Triplit SQL adapter!',
    status: 'published',
    views: 100,
    createdAt: new Date(),
  });

  await adapter.insertEntity('posts', {
    id: 'post-2',
    title: 'Second Post',
    content: 'This uses real SQL queries!',
    status: 'draft',
    views: 50,
    createdAt: new Date(),
  });

  // Example 1: Simple query
  console.log('\n🔍 Query 1: Get all posts');
  console.log('Triplit Query: { collectionName: "posts" }');
  console.log('Translates to SQL: SELECT * FROM "posts"');

  const allPosts = await adapter.fetch({
    collectionName: 'posts',
  });
  console.log(`Results: ${allPosts.length} posts`);

  // Example 2: Filtered query
  console.log('\n🔍 Query 2: Get published posts');
  console.log('Triplit Query: { where: [["status", "=", "published"]] }');
  console.log('Translates to SQL: SELECT * FROM "posts" WHERE status = $1');

  const publishedPosts = await adapter.fetch({
    collectionName: 'posts',
    where: [['status', '=', 'published']],
  });
  console.log(`Results: ${publishedPosts.length} published posts`);

  // Example 3: Complex query with sorting and limit
  console.log('\n🔍 Query 3: Get top viewed published posts');
  console.log('Triplit Query: Complex with filter, sort, and limit');
  console.log(
    'Translates to SQL: SELECT * FROM "posts" WHERE status = $1 ORDER BY views DESC LIMIT 10'
  );

  const topPosts = await adapter.fetch({
    collectionName: 'posts',
    where: [['status', '=', 'published']],
    order: [['views', 'DESC']],
    limit: 10,
  });
  console.log(`Results: ${topPosts.length} top posts`);

  // Example 4: LIKE operator
  console.log('\n🔍 Query 4: Search posts by title');
  console.log('Triplit Query: { where: [["title", "like", "%SQL%"]] }');
  console.log('Translates to SQL: SELECT * FROM "posts" WHERE title LIKE $1');

  const searchResults = await adapter.fetch({
    collectionName: 'posts',
    where: [['title', 'like', '%SQL%']],
  });
  console.log(`Results: ${searchResults.length} matching posts`);

  // Cleanup
  console.log('\n🗑️  Cleaning up test data...');
  await adapter.deleteEntity('posts', 'post-1');
  await adapter.deleteEntity('posts', 'post-2');
  console.log('✅ Cleanup complete');
}

// ============================================================================
// EXAMPLE 4: Working with Existing Tables
// ============================================================================

async function exampleExistingDatabase() {
  console.log('\n\n🗄️  EXAMPLE 4: Working with Existing Database\n');
  console.log('='.repeat(70));

  console.log('\nThis example shows how to use Triplit with tables');
  console.log('that already exist in your Postgres database.');

  // Suppose you have an existing 'products' table:
  // CREATE TABLE products (
  //   id TEXT PRIMARY KEY,
  //   name TEXT NOT NULL,
  //   price NUMERIC NOT NULL,
  //   in_stock BOOLEAN DEFAULT true,
  //   created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  // );

  const adapter = new SupabaseSQLAdapter(supabase, undefined, {
    debug: true,
  });

  console.log('\n1️⃣  Introspect the schema');
  const schema = await adapter.introspectSchema();

  if (schema.collections['products']) {
    console.log('✅ Found existing products table');
    console.log('   Schema:', schema.collections['products']);

    console.log('\n2️⃣  Query the existing table');
    const products = await adapter.fetch({
      collectionName: 'products',
      where: [['in_stock', '=', true]],
      order: [['price', 'ASC']],
      limit: 10,
    });

    console.log(`   Found ${products.length} in-stock products`);
    console.log(
      '\n✅ You can now use Triplit queries on your existing database!'
    );
  } else {
    console.log(
      '⚠️  No products table found - create one first to test this example'
    );
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n🚀 Triplit Supabase SQL Adapter Examples');
  console.log('=' .repeat(70));
  console.log('\nThis adapter uses REAL Postgres tables, not a KV store!');
  console.log('Triplit queries are translated to optimized SQL queries.');

  try {
    // Run examples
    await exampleIntrospection();
    await exampleMigrations();
    await exampleQuerying();
    await exampleExistingDatabase();

    console.log('\n\n✅ All examples completed successfully!');
    console.log('\nKey Takeaways:');
    console.log('  1. Introspect existing databases to generate Triplit schemas');
    console.log('  2. Use Triplit schemas to create Postgres tables via migrations');
    console.log('  3. Queries are translated to optimized SQL automatically');
    console.log('  4. Works with existing Postgres databases seamlessly');
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Check if module is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

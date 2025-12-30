# Supabase SQL Adapter

The Supabase SQL Adapter is a **proper SQL-based query engine** for Triplit that:

✅ Uses **actual Postgres tables** (not a KV store)
✅ Translates **Triplit queries to SQL queries**
✅ Supports **schema introspection** from existing Postgres databases
✅ Can **run migrations** to create tables from Triplit schemas
✅ Works with **existing Postgres instances**

## Key Difference from KV Adapter

| Aspect | KV Adapter | SQL Adapter |
|--------|------------|-------------|
| **Storage** | Single `triplit_kv_store` table | Actual Postgres tables per collection |
| **Queries** | Scan KV pairs and filter in memory | Direct SQL queries with WHERE/ORDER BY |
| **Schema** | Encoded in KV keys | Standard Postgres schema |
| **Existing DBs** | Requires migration to KV format | Can query existing tables directly |
| **Performance** | Good for small datasets | Optimized for large datasets |
| **Indexing** | Limited to KV key prefix | Full Postgres indexing support |

## Installation

### 1. Install Dependencies

```bash
npm install @triplit/db @supabase/supabase-js
```

### 2. Run SQL Setup

Run the setup SQL in your Supabase SQL Editor to create required helper functions:

```sql
-- From packages/db/migrations/supabase-sql-adapter-setup.sql
-- This creates:
-- - execute_sql() - For running migrations
-- - execute_query() - For parameterized queries
-- - get_tables() - For schema introspection
-- - get_columns() - For schema introspection
```

**Important**: These functions are only accessible to the `service_role`, so you must use the service role key (not the anon key).

## Usage

### Option 1: Use Existing Postgres Database

```typescript
import { createClient } from '@supabase/supabase-js';
import { SupabaseSQLAdapter } from '@triplit/db/sql/supabase-sql-adapter';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Must be service role
);

const adapter = new SupabaseSQLAdapter(supabase);

// Introspect existing database schema
const schema = await adapter.introspectSchema();

console.log('Found collections:', Object.keys(schema.collections));
// Example: ['users', 'posts', 'comments']

// Query existing tables using Triplit syntax
const users = await adapter.fetch({
  collectionName: 'users',
  where: [['role', '=', 'admin']],
  order: [['createdAt', 'DESC']],
  limit: 10,
});
```

### Option 2: Define Schema and Create Tables

```typescript
import { SupabaseSQLAdapter } from '@triplit/db/sql/supabase-sql-adapter';

// Define Triplit schema
const schema = {
  collections: {
    posts: {
      schema: {
        id: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
        authorId: { type: 'string' },
        published: { type: 'boolean' },
        tags: { type: 'set', items: { type: 'string' } },
        metadata: { type: 'json' },
        createdAt: { type: 'date' },
      },
    },
    authors: {
      schema: {
        id: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string' },
        bio: { type: 'string', config: { nullable: true } },
      },
    },
  },
  version: 0,
};

const adapter = new SupabaseSQLAdapter(supabase, schema, {
  autoMigrate: true, // Creates tables automatically
  debug: true, // Log SQL queries
});

// Tables are now created in Postgres!
```

### Querying

All queries are translated to SQL automatically:

```typescript
// Simple query
await adapter.fetch({
  collectionName: 'posts',
});
// SQL: SELECT * FROM "posts"

// With filters
await adapter.fetch({
  collectionName: 'posts',
  where: [['published', '=', true]],
});
// SQL: SELECT * FROM "posts" WHERE published = $1

// Complex query
await adapter.fetch({
  collectionName: 'posts',
  where: [
    ['published', '=', true],
    ['views', '>', 100],
  ],
  order: [['createdAt', 'DESC']],
  limit: 10,
});
// SQL: SELECT * FROM "posts"
//      WHERE published = $1 AND views > $2
//      ORDER BY "createdAt" DESC
//      LIMIT 10

// LIKE operator
await adapter.fetch({
  collectionName: 'posts',
  where: [['title', 'like', '%Triplit%']],
});
// SQL: SELECT * FROM "posts" WHERE title LIKE $1

// IN operator
await adapter.fetch({
  collectionName: 'posts',
  where: [['status', 'in', new Set(['published', 'featured'])]],
});
// SQL: SELECT * FROM "posts" WHERE status IN ($1, $2)
```

## Type Mapping

| Triplit Type | Postgres Type | Notes |
|--------------|---------------|-------|
| `string` | `TEXT` | VARCHAR for enums possible |
| `number` | `NUMERIC` | Precise decimals |
| `boolean` | `BOOLEAN` | Native boolean |
| `date` | `TIMESTAMP WITH TIME ZONE` | Full timezone support |
| `set` | `JSONB` | Stored as `{"item": true}` |
| `record` | `JSONB` | Nested objects |
| `json` | `JSONB` | Native JSON support |

## Schema Introspection

Generate Triplit schema from existing Postgres tables:

```typescript
const adapter = new SupabaseSQLAdapter(supabase);
const schema = await adapter.introspectSchema();

// schema now contains:
// {
//   collections: {
//     users: {
//       schema: {
//         id: { type: 'string' },
//         email: { type: 'string' },
//         created_at: { type: 'date' },
//         ...
//       }
//     }
//   }
// }

// Use introspected schema with DB
import { DB } from '@triplit/db';
const db = new DB({ schema });
```

## Migrations

Create tables from Triplit schema:

```typescript
const schema = {
  collections: {
    users: {
      schema: {
        id: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string' },
      },
    },
  },
  version: 0,
};

const adapter = new SupabaseSQLAdapter(supabase, schema, {
  autoMigrate: true,
});

// This creates:
// CREATE TABLE IF NOT EXISTS "users" (
//   "id" TEXT PRIMARY KEY,
//   "name" TEXT NOT NULL,
//   "email" TEXT NOT NULL
// );
```

## CRUD Operations

```typescript
// Insert
await adapter.insertEntity('posts', {
  id: 'post-1',
  title: 'Hello World',
  content: 'First post!',
  published: true,
  createdAt: new Date(),
});

// Get by ID
const post = await adapter.getEntity('posts', 'post-1');

// Update
await adapter.updateEntity('posts', 'post-1', {
  title: 'Updated Title',
});

// Delete
await adapter.deleteEntity('posts', 'post-1');

// Scan collection
for await (const entity of adapter.getEntitiesInCollection('posts')) {
  console.log(entity);
}
```

## Supported Operators

| Operator | SQL Equivalent | Example |
|----------|----------------|---------|
| `=` | `=` | `['status', '=', 'active']` |
| `!=` | `!=` | `['status', '!=', 'deleted']` |
| `<`, `>`, `<=`, `>=` | Same | `['age', '>', 18]` |
| `like` | `LIKE` | `['name', 'like', '%John%']` |
| `nlike` | `NOT LIKE` | `['name', 'nlike', '%test%']` |
| `in` | `IN` | `['id', 'in', new Set(['1', '2'])]` |
| `nin` | `NOT IN` | `['status', 'nin', new Set(['banned'])]` |
| `has` | `?` (JSONB) | `['tags', 'has', 'important']` |
| `isDefined` | `IS NOT NULL` | `['email', 'isDefined', true]` |

## Filter Groups (AND/OR)

```typescript
await adapter.fetch({
  collectionName: 'posts',
  where: [
    {
      mod: 'or',
      filters: [
        ['status', '=', 'published'],
        ['featured', '=', true],
      ],
    },
  ],
});
// SQL: SELECT * FROM "posts"
//      WHERE (status = $1 OR featured = $2)
```

## Subquery Filters (EXISTS)

```typescript
// Find posts where author has role 'admin'
await adapter.fetch({
  collectionName: 'posts',
  where: [
    {
      exists: {
        collectionName: 'users',
        where: [
          ['id', '=', '$1.authorId'],
          ['role', '=', 'admin'],
        ],
      },
    },
  ],
});
// SQL: SELECT * FROM "posts"
//      WHERE EXISTS (
//        SELECT 1 FROM "users"
//        WHERE users.id = posts.authorId
//        AND users.role = $1
//      )
```

## Configuration Options

```typescript
new SupabaseSQLAdapter(supabase, schema, {
  debug: true, // Log SQL queries (default: false)
  autoMigrate: true, // Run migrations on init (default: false)
  schema: 'public', // Postgres schema to use (default: 'public')
});
```

## Performance Considerations

### Advantages

✅ **Direct SQL execution** - No KV scanning overhead
✅ **Postgres query optimizer** - Automatic query optimization
✅ **Native indexes** - CREATE INDEX on any column
✅ **Efficient filtering** - Push filters to WHERE clause
✅ **Pagination** - Native LIMIT/OFFSET support

### Best Practices

1. **Add indexes** for frequently filtered columns:
   ```sql
   CREATE INDEX idx_posts_status ON posts(status);
   CREATE INDEX idx_posts_created_at ON posts(created_at);
   ```

2. **Use JSONB indexes** for nested queries:
   ```sql
   CREATE INDEX idx_posts_tags ON posts USING GIN(tags);
   ```

3. **Monitor query performance**:
   ```typescript
   const adapter = new SupabaseSQLAdapter(supabase, schema, {
     debug: true, // Log all SQL queries
   });
   ```

4. **Batch operations** when inserting multiple entities

## Limitations

### Current

- **No native transactions**: Supabase JS client doesn't expose Postgres transactions. Use RPC for complex operations.
- **No streaming**: Results are fetched in batches (1000 rows at a time)
- **Includes not yet implemented**: Relations/subqueries need manual handling currently

### Future Enhancements

- [ ] Full support for `include` (relations)
- [ ] Native transaction support
- [ ] Query result streaming
- [ ] Query caching
- [ ] Connection pooling configuration
- [ ] Migration rollback support
- [ ] View extraction optimization

## Comparison with Other Adapters

### When to Use SQL Adapter

✅ Large datasets (>10,000 entities)
✅ Complex filtering and sorting
✅ Existing Postgres database
✅ Need for custom indexes
✅ Server-side usage

### When to Use KV Adapter

✅ Small datasets (<10,000 entities)
✅ Simple key-value access patterns
✅ Embedded/local-first applications
✅ Want simpler setup

## Troubleshooting

### "RPC function not found"

**Solution**: Run the setup SQL migration in your Supabase SQL Editor.

### "Permission denied"

**Solution**: Use the service role key, not the anon key.

### "Table does not exist"

**Solution**: Either:
- Run migrations: `new SupabaseSQLAdapter(supabase, schema, { autoMigrate: true })`
- Create tables manually in Postgres

### Slow queries

**Solutions**:
- Add indexes on filtered columns
- Use `EXPLAIN ANALYZE` to check query plans
- Enable debug mode to see generated SQL
- Monitor in Supabase dashboard

## Example: Full Application

```typescript
import { createClient } from '@supabase/supabase-js';
import { SupabaseSQLAdapter } from '@triplit/db/sql/supabase-sql-adapter';

// Setup
const supabase = createClient(url, serviceKey);
const schema = {
  collections: {
    users: { /* ... */ },
    posts: { /* ... */ },
  },
  version: 0,
};

const adapter = new SupabaseSQLAdapter(supabase, schema, {
  autoMigrate: true,
  debug: process.env.NODE_ENV === 'development',
});

// API route
app.get('/api/posts', async (req, res) => {
  const posts = await adapter.fetch({
    collectionName: 'posts',
    where: [['published', '=', true]],
    order: [['createdAt', 'DESC']],
    limit: 20,
  });

  res.json(posts);
});

app.post('/api/posts', async (req, res) => {
  await adapter.insertEntity('posts', {
    id: generateId(),
    ...req.body,
    createdAt: new Date(),
  });

  res.json({ success: true });
});
```

## Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Triplit Documentation](https://triplit.dev/docs)
- [Postgres Documentation](https://www.postgresql.org/docs/)
- [Setup SQL](../../migrations/supabase-sql-adapter-setup.sql)
- [Example Code](../../examples/supabase-sql-adapter/)

## Contributing

This is a new feature! Feedback and contributions are welcome:

- Report bugs or suggest features via GitHub issues
- Submit PRs for improvements
- Share your use cases and experiences

## License

Same as Triplit core license.

# Supabase Postgres Adapter

The Supabase Postgres adapter allows you to use Supabase's Postgres database as the storage backend for Triplit, replacing the default ordered key-value (KV) abstraction with a SQL-based implementation.

## Overview

This adapter provides a drop-in replacement for Triplit's default storage layer, enabling you to:

- Store Triplit data in a Postgres database managed by Supabase
- Leverage Postgres's robustness, ACID guarantees, and scalability
- Use Supabase's real-time features and authentication (separate from this adapter)
- Host your Triplit database in the cloud without managing infrastructure

## Installation

### 1. Install Dependencies

```bash
npm install @triplit/db @supabase/supabase-js
# or
yarn add @triplit/db @supabase/supabase-js
# or
pnpm add @triplit/db @supabase/supabase-js
```

### 2. Create the Database Schema

Run the SQL migration in your Supabase SQL Editor to create the required table:

```sql
-- See packages/db/migrations/supabase-postgres-schema.sql
-- Copy and paste the contents into your Supabase SQL Editor
```

The migration creates:
- `triplit_kv_store` table with optimized indexes
- Row Level Security (RLS) policies
- Automatic `updated_at` triggers

### 3. Configure Row Level Security (RLS)

**Important**: The default migration includes RLS policies for authenticated users. Adjust these based on your security requirements:

**Option A: Server-side usage (Recommended)**
Use the Supabase service role key (bypasses RLS):

```typescript
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Service role key
);
```

**Option B: Client-side usage**
Keep RLS enabled and customize policies for your use case. The default policy allows all authenticated users full access.

## Usage

### Basic Setup

```typescript
import { DB } from '@triplit/db';
import { SupabasePostgresKVStore } from '@triplit/db/storage/supabase-postgres';
import { createClient } from '@supabase/supabase-js';

// Create Supabase client
const supabase = createClient(
  'https://your-project.supabase.co',
  'your-anon-or-service-role-key'
);

// Create the KV store
const kvStore = new SupabasePostgresKVStore(supabase);

// Create Triplit DB with Supabase storage
const db = new DB({
  kv: kvStore,
  schema: {
    // Your schema here
  },
});

// Use the database normally
await db.insert('users', {
  id: '1',
  name: 'Alice',
  email: 'alice@example.com',
});

const users = await db.fetch(db.query('users').build());
console.log(users);
```

### Configuration Options

```typescript
const kvStore = new SupabasePostgresKVStore(supabase, {
  // Optional: Custom table name (default: 'triplit_kv_store')
  tableName: 'my_custom_kv_table',

  // Optional: Auto-create table if it doesn't exist (default: true)
  // Set to false in production and use migrations instead
  autoCreateTable: false,
});
```

### Server Usage with Environment Variables

When using the `@triplit/server` package, you can configure Supabase storage via environment variables:

```bash
# .env
STORAGE=supabase-postgres
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
SUPABASE_TABLE_NAME=triplit_kv_store  # Optional
```

```typescript
import { createTriplitStorageProvider } from '@triplit/server/storage';

const storage = await createTriplitStorageProvider('supabase-postgres');
const db = new DB({ kv: storage });
```

### Advanced: Custom Supabase Client

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
    },
    db: {
      schema: 'public',
    },
    global: {
      headers: {
        'x-application-name': 'triplit-app',
      },
    },
  }
);

const kvStore = new SupabasePostgresKVStore(supabase);
```

## Architecture

### How It Works

The adapter implements Triplit's `KVStore` interface, translating key-value operations to SQL queries:

1. **Keys**: Triplit uses "tuples" (arrays of values) as keys. These are encoded into lexicographically sortable strings using a custom encoding scheme.

2. **Values**: All values are JSON-serialized and stored in a `TEXT` column.

3. **Range Scans**: Prefix-based range scans are implemented using Postgres's string comparison operators:
   ```sql
   SELECT * FROM triplit_kv_store
   WHERE key >= 'prefix' AND key < 'prefix\uffff'
   ORDER BY key
   ```

4. **Transactions**: The adapter uses Triplit's `MemoryTransaction` to buffer writes and execute them in batches via Supabase's batch operations.

### Data Model

```
triplit_kv_store
├── key (TEXT, PRIMARY KEY)       - Encoded tuple key
├── value (TEXT)                   - JSON-serialized value
├── created_at (TIMESTAMP)         - Record creation time
└── updated_at (TIMESTAMP)         - Last update time
```

### Performance Considerations

1. **Batch Operations**: The adapter batches multiple operations for better performance.

2. **Indexes**: The migration includes optimized indexes for range scans.

3. **Streaming**: Currently, scan operations fetch all results at once. For large datasets, consider implementing pagination at the query level.

4. **Connection Pooling**: Supabase handles connection pooling automatically.

## Limitations

1. **No True Transactions**: The Supabase JS client doesn't expose native Postgres transactions. The adapter uses batch operations, which aren't atomic. For true ACID guarantees, consider using a direct Postgres connection pool.

2. **Scan Performance**: Large range scans fetch all data at once. For datasets with millions of records, this may impact performance.

3. **RLS Overhead**: If using Row Level Security, be aware of potential performance overhead on queries.

## Migration from Other Adapters

To migrate from SQLite, LMDB, or other adapters to Supabase:

1. **Export Data**: Use Triplit's export functionality to dump your existing data
2. **Run Migration**: Apply the Supabase schema migration
3. **Import Data**: Restore data using Triplit's import functionality with the new adapter

```typescript
// Export from old storage
const oldDb = new DB({ kv: oldKvStore });
const data = await oldDb.export();

// Import to Supabase storage
const newDb = new DB({ kv: supabaseKvStore });
await newDb.import(data);
```

## Troubleshooting

### "Table does not exist" error

**Solution**: Run the SQL migration in your Supabase SQL Editor.

### "Row Level Security policy violation" error

**Solution**: Either:
- Use the service role key (bypasses RLS)
- Update RLS policies to match your authentication setup
- Disable RLS (not recommended for production)

### Slow query performance

**Solutions**:
- Ensure indexes are created (check migration)
- Use the service role key to bypass RLS
- Monitor Supabase dashboard for query performance
- Consider upgrading your Supabase plan for better performance

### Connection errors

**Solutions**:
- Verify `SUPABASE_URL` and `SUPABASE_KEY` are correct
- Check your Supabase project is active
- Ensure network connectivity to Supabase

## Security Best Practices

1. **Never expose service role keys** on the client side
2. **Use environment variables** for credentials
3. **Configure RLS policies** appropriate to your use case
4. **Use HTTPS only** (Supabase enforces this by default)
5. **Rotate keys regularly** using Supabase dashboard

## Example: Full-Stack Application

```typescript
// server/db.ts
import { DB } from '@triplit/db';
import { SupabasePostgresKVStore } from '@triplit/db/storage/supabase-postgres';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Server-side only!
);

export const db = new DB({
  kv: new SupabasePostgresKVStore(supabase),
  schema: {
    collections: {
      users: {
        schema: {
          id: { type: 'string', options: {} },
          name: { type: 'string', options: {} },
          email: { type: 'string', options: {} },
        },
      },
    },
  },
});

// API route
app.post('/api/users', async (req, res) => {
  await db.insert('users', req.body);
  res.json({ success: true });
});

app.get('/api/users', async (req, res) => {
  const users = await db.fetch(db.query('users').build());
  res.json(users);
});
```

## Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Triplit Documentation](https://triplit.dev/docs)
- [Supabase Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Schema Migration File](./migrations/supabase-postgres-schema.sql)

## Contributing

Found a bug or want to improve the adapter? Please open an issue or PR!

## License

Same as Triplit core license.

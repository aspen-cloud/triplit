# Triplit Supabase Adapter Example

This example demonstrates how to use Triplit with the Supabase Postgres adapter, which replaces the default ordered KV store with a Postgres database hosted on Supabase.

## Prerequisites

1. **Supabase Account**: Create a free account at [supabase.com](https://supabase.com)
2. **Supabase Project**: Create a new project in the Supabase dashboard
3. **Database Setup**: Run the SQL migration to create the required table

## Setup

### 1. Run the Database Migration

1. Open your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy the contents of `../../packages/db/migrations/supabase-postgres-schema.sql`
4. Paste and run the SQL in the editor

### 2. Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your Supabase credentials:
   - `SUPABASE_URL`: Your project URL (found in Settings > API)
   - `SUPABASE_KEY`: Your service role key (found in Settings > API > service_role)

   ⚠️ **Important**: Use the service role key, not the anon key, as it bypasses Row Level Security (RLS). If using the anon key, ensure you've configured appropriate RLS policies.

### 3. Install Dependencies

From the example directory:

```bash
npm install
# or
yarn install
# or
pnpm install
```

### 4. Run the Example

```bash
npm start
# or
yarn start
# or
pnpm start
```

For development with auto-reload:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

## What This Example Does

The example demonstrates:

1. **Setting up the adapter**: Creating a Supabase client and SupabasePostgresKVStore
2. **Defining a schema**: Setting up collections for users and posts
3. **CRUD operations**:
   - Inserting users and posts
   - Querying data
   - Filtering results
   - Updating records
4. **Using Triplit's query API** with Supabase as the backend

## Expected Output

```
🚀 Triplit with Supabase Postgres Adapter Example

📝 Inserting a user...
✅ User inserted

📝 Inserting a post...
✅ Post inserted

🔍 Querying all users...
Users: [
  {
    "id": "user-1",
    "name": "Alice Johnson",
    "email": "alice@example.com",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
]

🔍 Querying all posts...
Posts: [
  {
    "id": "post-1",
    "title": "Hello Triplit with Supabase!",
    "content": "This post is stored in Postgres via Supabase...",
    "authorId": "user-1",
    "published": true,
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
]

✅ Example completed successfully!
```

## Verifying Data in Supabase

You can view the data in your Supabase dashboard:

1. Go to Table Editor in your Supabase project
2. Select the `triplit_kv_store` table
3. You'll see the encoded keys and JSON values

The data is stored in an encoded format:
- **Keys**: Encoded tuples (e.g., `["users", "user-1"]` → encoded string)
- **Values**: JSON-serialized entities

## Troubleshooting

### "Missing required environment variables" Error

**Solution**: Ensure you've copied `.env.example` to `.env` and filled in the values.

### "Table does not exist" Error

**Solution**: Run the SQL migration in your Supabase SQL Editor.

### "Row Level Security policy violation" Error

**Solution**: You're likely using the anon key instead of the service role key. Either:
- Use the service role key in your `.env`
- Or configure RLS policies in Supabase to allow the operations

### Connection Errors

**Solution**:
- Verify your `SUPABASE_URL` is correct
- Check your Supabase project is active
- Ensure you have internet connectivity

## Next Steps

- Explore the full [Supabase Adapter Documentation](../../packages/db/SUPABASE_ADAPTER.md)
- Learn about [Triplit's query API](https://triplit.dev/docs)
- Set up [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security) for your use case
- Build a full-stack application using this adapter

## Resources

- [Triplit Documentation](https://triplit.dev/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Postgres Adapter Guide](../../packages/db/SUPABASE_ADAPTER.md)

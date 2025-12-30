# Triplit SQL Adapter

This directory contains the SQL adapter implementation for Triplit, which translates Triplit queries to native Postgres SQL queries.

## Architecture

### Core Modules

#### `type-mapping.ts`
Type conversion utilities between Triplit schema types and Postgres column types.

**Functions:**
- `triplitTypeToPostgres()` - Convert Triplit DataType to PostgresColumn
- `postgresTypeToTriplit()` - Convert Postgres column info to Triplit DataType
- `generateCreateTableSQL()` - Generate CREATE TABLE statements
- `generateAddColumnSQL()` - Generate ALTER TABLE ADD COLUMN statements
- `sanitizeSQLIdentifier()` - Safely quote SQL identifiers
- `sanitizeSQLValue()` - Convert values to SQL literals

#### `query-planner.ts`
Translates Triplit PreparedQuery objects into parameterized SQL queries.

**Class:** `SQLQueryPlanner`

**Methods:**
- `planSelect(query)` - Generate SELECT query with WHERE, ORDER BY, LIMIT
- `planFilters(filters)` - Convert Triplit filters to WHERE clause
- `planOrderBy(order)` - Generate ORDER BY clause

**Features:**
- All comparison operators: `=`, `!=`, `<`, `>`, `<=`, `>=`
- Pattern matching: `LIKE`, `NOT LIKE`
- Set operations: `IN`, `NOT IN`
- JSONB operations: `?` (has), nested path access
- Filter groups: AND/OR logic
- Subqueries: EXISTS filters
- Parameterized queries (SQL injection safe)

#### `supabase-sql-adapter.ts`
Main adapter class that uses Supabase client to execute SQL queries.

**Class:** `SupabaseSQLAdapter`

**Methods:**
- `fetch(query)` - Execute Triplit query, returns results
- `getEntity(collection, id)` - Get single entity by ID
- `getEntitiesInCollection(collection)` - Stream all entities
- `insertEntity(collection, entity)` - Insert new entity
- `updateEntity(collection, id, updates)` - Update entity
- `deleteEntity(collection, id)` - Delete entity
- `introspectSchema()` - Generate Triplit schema from existing Postgres tables
- `runMigrations()` - Create Postgres tables from Triplit schema

## Type Mappings

| Triplit Type | Postgres Type |
|--------------|---------------|
| `string` | `TEXT` |
| `number` | `NUMERIC` |
| `boolean` | `BOOLEAN` |
| `date` | `TIMESTAMP WITH TIME ZONE` |
| `set` | `JSONB` |
| `record` | `JSONB` |
| `json` | `JSONB` |

## Query Translation Examples

### Simple Query
```typescript
// Input
{ collectionName: 'posts' }

// Output
SELECT * FROM "posts"
```

### Filtered Query
```typescript
// Input
{
  collectionName: 'posts',
  where: [['status', '=', 'published'], ['views', '>', 100]],
  order: [['createdAt', 'DESC']],
  limit: 10
}

// Output
SELECT * FROM "posts"
WHERE "status" = $1 AND "views" > $2
ORDER BY "createdAt" DESC
LIMIT 10

// Params: ['published', 100]
```

### Complex Query
```typescript
// Input
{
  collectionName: 'posts',
  where: [
    {
      mod: 'or',
      filters: [
        ['featured', '=', true],
        ['views', '>', 1000]
      ]
    }
  ]
}

// Output
SELECT * FROM "posts"
WHERE ("featured" = $1 OR "views" > $2)

// Params: [true, 1000]
```

### Subquery (EXISTS)
```typescript
// Input
{
  collectionName: 'posts',
  where: [{
    exists: {
      collectionName: 'users',
      where: [
        ['id', '=', '$1.authorId'],
        ['role', '=', 'admin']
      ]
    }
  }]
}

// Output
SELECT * FROM "posts"
WHERE EXISTS (
  SELECT 1 FROM "users"
  WHERE "id" = $1 AND "role" = $2
)

// Params: ['$1.authorId', 'admin']
```

## Tests

### Test Coverage

#### `query-planner.test.ts` (17 test suites, 50+ tests)

**Covered:**
- ✅ Basic SELECT queries (*, specific columns)
- ✅ WHERE clause with all operators
  - Comparison: `=`, `!=`, `<`, `>`, `<=`, `>=`
  - Pattern: `LIKE`, `NOT LIKE`
  - Set: `IN`, `NOT IN` (including empty sets)
  - JSONB: `has`, `!has`
  - Null: `isDefined`
- ✅ Filter groups (AND/OR, nested)
- ✅ Subquery filters (EXISTS)
- ✅ ORDER BY (single, multiple, ASC/DESC)
- ✅ LIMIT
- ✅ Complex queries (combined WHERE, ORDER BY, LIMIT)
- ✅ Nested JSONB paths
- ✅ Parameter indexing
- ✅ Edge cases (empty filters, special characters, null values, dates)
- ✅ Debug mode

#### `type-mapping.test.ts` (9 test suites, 40+ tests)

**Covered:**
- ✅ Triplit → Postgres type conversion
  - All primitive types
  - Complex types (set, record, json)
  - Nullable fields
  - Default values
  - Primary keys
  - Enums
- ✅ Postgres → Triplit type conversion
  - All SQL types
  - Nullable fields
  - Case-insensitive type names
- ✅ SQL generation
  - CREATE TABLE statements
  - ALTER TABLE ADD COLUMN statements
  - Column constraints (NOT NULL, PRIMARY KEY, UNIQUE, DEFAULT)
- ✅ SQL sanitization
  - Identifier quoting
  - Value escaping
  - Special characters
  - JSONB formatting
- ✅ Round-trip conversions (Triplit → Postgres → Triplit)

### Running Tests

```bash
# Run all SQL tests
yarn test src/sql/

# Run specific test file
yarn test src/sql/query-planner.test.ts

# Run with coverage
yarn test:coverage src/sql/
```

## Usage

See the main documentation at `/packages/db/SUPABASE_SQL_ADAPTER.md` for usage examples.

Quick example:

```typescript
import { SupabaseSQLAdapter } from '@triplit/db/sql/supabase-sql-adapter';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(url, serviceKey);
const adapter = new SupabaseSQLAdapter(supabase, schema, {
  debug: true,
  autoMigrate: true,
});

const results = await adapter.fetch({
  collectionName: 'posts',
  where: [['published', '=', true]],
  order: [['createdAt', 'DESC']],
  limit: 20,
});
```

## Future Enhancements

- [ ] Support for `include` (relations via JOINs)
- [ ] Query result streaming
- [ ] Native Postgres transactions
- [ ] Query caching
- [ ] View extraction optimization
- [ ] Migration rollback
- [ ] Index creation helpers
- [ ] Query performance monitoring

## Contributing

When adding new features:

1. Add comprehensive tests
2. Update type mappings if adding new types
3. Document query translation behavior
4. Add examples to main documentation

# TPC-C Benchmark for @triplit/db vs SQLite

This directory contains a comprehensive TPC-C (Transaction Processing Performance Council - C) benchmark implementation for comparing performance between `@triplit/db` and SQLite.

## Overview

TPC-C is a widely-used industry-standard benchmark for database systems that simulates a warehouse management scenario. It measures the performance of a database system through five types of transactions:

1. **New Order** - Creating new customer orders (45% of transactions)
2. **Payment** - Recording customer payments (43% of transactions)
3. **Order Status** - Checking order status (4% of transactions)
4. **Delivery** - Processing delivered orders (4% of transactions)
5. **Stock Level** - Checking inventory levels (4% of transactions)

## Files

- `schema.ts` - Triplit DB schema definitions for TPC-C tables
- `sqlite-schema.ts` - SQLite schema definitions
- `data-generator.ts` - Utilities for generating TPC-C compliant test data
- `load-data.ts` - Data loading functions for both databases
- `transactions-triplit.ts` - Transaction implementations for Triplit DB
- `transactions-sqlite.ts` - Transaction implementations for SQLite
- `../tpcc.bench.ts` - Main benchmark runner using Mitata

## Schema

The TPC-C schema includes the following tables:

- **Warehouse** - Physical warehouses (scaling factor)
- **District** - Sales districts (10 per warehouse)
- **Customer** - Customer records (3000 per district)
- **Order** - Customer orders (initial 3000 per district)
- **OrderLine** - Order line items (5-15 per order)
- **NewOrder** - Undelivered orders (~900 per district)
- **Item** - Available items (100,000 static items)
- **Stock** - Inventory levels (100,000 per warehouse)
- **History** - Payment history

## Running the Benchmark

### Quick Start (Small Dataset)

For quick testing with a small dataset:

```bash
cd packages/db
yarn bench:tpcc
```

The default configuration uses a reduced dataset for faster loading:
- 1 warehouse
- 1,000 items (vs 100,000 in standard)
- 2 districts (vs 10 in standard)
- 30 customers per district (vs 3,000 in standard)
- 30 orders per district (vs 3,000 in standard)

### Standard Benchmark

To run with a more realistic dataset, edit `bench/tpcc.bench.ts` and change:

```typescript
const CONFIG = SMALL_CONFIG;
```

to:

```typescript
const CONFIG = STANDARD_CONFIG;
```

The standard configuration provides more realistic results but takes longer to load:
- 2 warehouses
- 10,000 items
- 5 districts
- 300 customers per district
- 300 orders per district

### Full TPC-C Specification

For a full TPC-C compliant benchmark, use:

```typescript
const CONFIG = {
  numWarehouses: 10,
  itemsPerWarehouse: 100000,
  districtsPerWarehouse: 10,
  customersPerDistrict: 3000,
  ordersPerDistrict: 3000,
};
```

⚠️ **Warning**: Loading full TPC-C data can take several minutes and requires significant memory.

## Benchmark Results

The benchmark measures:

- **Throughput** - Operations per second for each transaction type
- **Latency** - Mean execution time and percentiles
- **Comparison** - Direct performance comparison between Triplit DB and SQLite

Results are displayed using Mitata's summary format showing:
- Mean execution time
- Min/Max times
- Standard deviation
- Operations per second

## Understanding the Results

### Performance Factors

**Triplit DB:**
- Uses in-memory B-tree (sorted-btree)
- Schema-based with type safety
- Modern TypeScript API
- Incremental View Maintenance (IVM)

**SQLite:**
- Uses in-memory database (`:memory:`)
- SQL-based queries
- C implementation with Node.js bindings
- Mature and highly optimized

### Expected Patterns

- **Read-heavy transactions** (Order Status, Stock Level) may favor SQLite's optimized query engine
- **Write-heavy transactions** (New Order, Payment) show the overhead of each system's write path
- **Complex transactions** (Delivery) test transaction coordination and multi-table operations

## Customizing the Benchmark

### Adjusting Dataset Size

Edit the configuration in `bench/tpcc.bench.ts`:

```typescript
const CONFIG: TPCCConfig = {
  numWarehouses: 1,        // Scaling factor
  itemsPerWarehouse: 1000, // 100000 for standard
  districtsPerWarehouse: 2, // 10 for standard
  customersPerDistrict: 30, // 3000 for standard
  ordersPerDistrict: 30,    // 3000 for standard
};
```

### Modifying Transactions

Transaction implementations are in:
- `transactions-triplit.ts` - Triplit DB versions
- `transactions-sqlite.ts` - SQLite versions

Each file contains the five transaction types as methods.

### Adding New Transactions

1. Add the transaction method to both transaction classes
2. Add a benchmark in `bench/tpcc.bench.ts`:

```typescript
bench('My Transaction - Triplit', async () => {
  await triplitTransactions.myTransaction();
});

bench('My Transaction - SQLite', () => {
  sqliteTransactions.myTransaction();
});
```

## Technical Details

### Data Generation

Data is generated according to TPC-C specification v5.11:
- Reproducible with seed values
- Proper cardinality and distributions
- Realistic string lengths and formats
- 10% of items/stock contain "ORIGINAL" keyword

### Transaction Characteristics

- **New Order**: 5-15 order lines, stock updates, multi-table writes
- **Payment**: Updates warehouse, district, customer, inserts history
- **Order Status**: Read-only, queries customer and order details
- **Delivery**: Processes 10 districts, updates multiple tables
- **Stock Level**: Complex query across order lines and stock

## Troubleshooting

### Out of Memory

Reduce the dataset size in `CONFIG`.

### Slow Loading

This is expected for large datasets. Use `SMALL_CONFIG` for development.

### Type Errors

Run `yarn build` to compile TypeScript before benchmarking.

## References

- [TPC-C Specification](http://www.tpc.org/tpcc/)
- [Triplit Documentation](https://www.triplit.dev/)
- [SQLite Documentation](https://www.sqlite.org/docs.html)
- [Mitata Benchmarking](https://github.com/evanwashere/mitata)

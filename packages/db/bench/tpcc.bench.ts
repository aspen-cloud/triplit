import { run, bench, summary, boxplot } from 'mitata';
import { DB } from '../src/db.js';
import { BTreeKVStore } from '../src/kv-store/storage/memory-btree.js';
import Database from 'better-sqlite3';
import { TPCC_SCHEMA } from './tpcc/schema.js';
import {
  createSQLiteTables,
  dropSQLiteTables,
} from './tpcc/sqlite-schema.js';
import { loadDataTriplit, loadDataSQLite } from './tpcc/load-data.js';
import { TPCCTransactionsTriplit } from './tpcc/transactions-triplit.js';
import { TPCCTransactionsSQLite } from './tpcc/transactions-sqlite.js';
import type { TPCCConfig } from './tpcc/data-generator.js';

/**
 * TPC-C Benchmark comparing @triplit/db and SQLite
 *
 * This benchmark implements the standard TPC-C transactions:
 * - New Order: Creates a new customer order
 * - Payment: Records a customer payment
 * - Order Status: Queries order status
 * - Delivery: Processes order delivery
 * - Stock Level: Checks inventory levels
 *
 * Configuration:
 * - Small: 1 warehouse (for quick testing)
 * - Standard: 10 warehouses (for realistic comparison)
 *
 * Run with: node --loader tsx/esm bench/tpcc.bench.ts
 */

// Configuration for the benchmark
// Use smaller dataset for faster benchmarking
const SMALL_CONFIG: TPCCConfig = {
  numWarehouses: 1,
  itemsPerWarehouse: 1000, // Reduced from 100000 for faster loading
  districtsPerWarehouse: 2, // Reduced from 10
  customersPerDistrict: 30, // Reduced from 3000
  ordersPerDistrict: 30, // Reduced from 3000
};

// For more realistic benchmark (takes longer to load)
const STANDARD_CONFIG: TPCCConfig = {
  numWarehouses: 2,
  itemsPerWarehouse: 10000,
  districtsPerWarehouse: 5,
  customersPerDistrict: 300,
  ordersPerDistrict: 300,
};

// Choose configuration (use SMALL_CONFIG for quick testing)
const CONFIG = SMALL_CONFIG;

console.log('='.repeat(70));
console.log('TPC-C Benchmark: @triplit/db vs SQLite');
console.log('='.repeat(70));
console.log('Configuration:', CONFIG);
console.log('='.repeat(70));

// Pre-load data before benchmarks
let triplitDB: DB;
let triplitTransactions: TPCCTransactionsTriplit;
let sqliteDB: Database;
let sqliteTransactions: TPCCTransactionsSQLite;

console.log('\n🔄 Setting up Triplit DB...');
triplitDB = new DB({
  schema: TPCC_SCHEMA,
  kv: new BTreeKVStore(),
});
await loadDataTriplit(triplitDB, CONFIG);
triplitTransactions = new TPCCTransactionsTriplit(triplitDB, CONFIG.numWarehouses);
console.log('✓ Triplit DB ready');

console.log('\n🔄 Setting up SQLite...');
sqliteDB = new Database(':memory:');
createSQLiteTables(sqliteDB);
loadDataSQLite(sqliteDB, CONFIG);
sqliteTransactions = new TPCCTransactionsSQLite(sqliteDB, CONFIG.numWarehouses);
console.log('✓ SQLite ready');

console.log('\n' + '='.repeat(70));
console.log('Running benchmarks...');
console.log('='.repeat(70) + '\n');

// Benchmark each transaction type
summary(() => {
  // New Order Transaction
  bench('New Order - Triplit', async () => {
    await triplitTransactions.newOrder();
  });

  bench('New Order - SQLite', () => {
    sqliteTransactions.newOrder();
  });

  // Payment Transaction
  bench('Payment - Triplit', async () => {
    await triplitTransactions.payment();
  });

  bench('Payment - SQLite', () => {
    sqliteTransactions.payment();
  });

  // Order Status Transaction
  bench('Order Status - Triplit', async () => {
    await triplitTransactions.orderStatus();
  });

  bench('Order Status - SQLite', () => {
    sqliteTransactions.orderStatus();
  });

  // Delivery Transaction
  bench('Delivery - Triplit', async () => {
    await triplitTransactions.delivery();
  });

  bench('Delivery - SQLite', () => {
    sqliteTransactions.delivery();
  });

  // Stock Level Transaction
  bench('Stock Level - Triplit', async () => {
    await triplitTransactions.stockLevel();
  });

  bench('Stock Level - SQLite', () => {
    sqliteTransactions.stockLevel();
  });
});

await run();

console.log('\n' + '='.repeat(70));
console.log('Benchmark complete!');
console.log('='.repeat(70));
console.log('\nNotes:');
console.log('- Triplit uses an in-memory B-tree store');
console.log('- SQLite uses :memory: database');
console.log('- Both databases have the same TPC-C schema and data');
console.log('- Transactions include reads, writes, and updates');
console.log(`- Dataset: ${CONFIG.numWarehouses} warehouses, ${CONFIG.itemsPerWarehouse} items`);

// Cleanup
sqliteDB.close();

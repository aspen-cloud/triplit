import { expect, test, describe, beforeEach } from 'bun:test';
import { BunSQLiteKVStore } from '../../src/kv-store/storage/bun-sqlite';
import { kvTests } from '../kv-tests';
const scenario = {
  skipCount: false,
  skipTransaction: false,
  store: new BunSQLiteKVStore(':memory:'),
};
kvTests(scenario, { test, describe, beforeEach, expect });

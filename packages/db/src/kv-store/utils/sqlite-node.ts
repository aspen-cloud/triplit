/**
 * This file imports 'fs', so is only safe to be used in a runtime with node compliant modules available.
 *
 * If we do need to expand walSizeGuard to other runtimes, we should consider stubbing out the fs and breaking up the import:
 * {
 *    "exports": {
 *      "./fs-bridge": {
 *          "react-native": "./dist/fs-bridge.native.js",
 *          "browser": "./dist/fs-bridge.browser.js",
 *          "default": "./dist/fs-bridge.node.js"
 *      }
 *    }
 * }
 *
 * TODO: evaluate if walSizeGuard should be available on client side apps (React Native, browser / OPFS)
 */
import fs from 'fs';
import { CHECKPOINT_RESTART, CHECKPOINT_TRUNCATE } from './sqlite.js';

/**
 * Just in case there are long running reads (possibly iterators), truncation may be blocked
 * Add this to an interval to guard against a growing WAL file to ensure truncation occurs.
 *
 * Currently only should be used in node environments.
 */
export function walSizeGuard(
  db: {
    exec: (sql: string) => void;
  },
  walFile: string,
  options: {
    restartMax: number;
    truncateMax: number;
  }
) {
  try {
    const walExists = fs.existsSync(walFile);
    if (!walExists) {
      // If we're seeing this warning, check how how we're reading the wal file (a bundler could cause issues)
      console.warn('Could not find wal file');
    }
    let walSize = walExists ? fs.statSync(walFile).size : 0;
    if (walSize > options.truncateMax) {
      db.exec(CHECKPOINT_TRUNCATE);
      walSize = fs.statSync(walFile).size;
    } else if (walSize > options.restartMax) {
      db.exec(CHECKPOINT_RESTART);
      walSize = fs.statSync(walFile).size;
    }
  } catch (e) {
    /* swallow SQLITE_BUSY & ENOENT */
    console.error('Error on wal guard', e);
  }
}

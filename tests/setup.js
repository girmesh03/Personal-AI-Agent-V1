/**
 * @file tests/setup.js
 * @description Preload module for test execution. Enforces NODE_ENV=test before any application code loads,
 * isolates storage to backend/storage/test, and cleans up test storage files on startup and teardown.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'test';

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(TESTS_DIR, '../backend');
const TEST_STORAGE_BASE = path.resolve(BACKEND_ROOT, 'storage/test');
const TEST_STORAGE_ROOT = path.resolve(TEST_STORAGE_BASE, String(process.pid));

// Set process-isolated test storage root explicitly
process.env.STORAGE_LOCAL_ROOT = TEST_STORAGE_ROOT;

// Clean process-isolated test storage before starting tests to guarantee clean state
if (fs.existsSync(TEST_STORAGE_ROOT)) {
  try {
    fs.rmSync(TEST_STORAGE_ROOT, { recursive: true, force: true });
  } catch {
    // Ignore cleanup race
  }
}

// Ensure cleanup on test process completion
const cleanStorage = () => {
  if (fs.existsSync(TEST_STORAGE_ROOT)) {
    try {
      fs.rmSync(TEST_STORAGE_ROOT, { recursive: true, force: true });
    } catch {
      // Ignore exit cleanup race
    }
  }
  // Prune parent test directory if all child process subdirectories are done
  try {
    if (fs.existsSync(TEST_STORAGE_BASE)) {
      const remaining = fs.readdirSync(TEST_STORAGE_BASE);
      if (remaining.length === 0) {
        fs.rmSync(TEST_STORAGE_BASE, { recursive: true, force: true });
      }
    }
  } catch {
    // Ignore race across workers
  }
};

process.on('exit', cleanStorage);
process.on('SIGINT', () => {
  cleanStorage();
  process.exit(130);
});
process.on('SIGTERM', () => {
  cleanStorage();
  process.exit(143);
});

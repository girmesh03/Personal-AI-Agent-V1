/**
 * @file backend/scripts/runTest.js
 * @description Selective test runner executing individual integration tests on demand.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testsDir = path.resolve(__dirname, 'tests');

const targetArg = process.argv[2];

if (!targetArg) {
  const availableTests = fs.existsSync(testsDir)
    ? fs.readdirSync(testsDir).filter((file) => file.endsWith('.test.js'))
    : [];

  console.log('ℹ  Please specify an individual test to run.');
  console.log('   Usage: npm test <test-name>  (e.g., npm test health)\n');
  if (availableTests.length > 0) {
    console.log('   Available tests in backend/scripts/tests/:');
    availableTests.forEach((file) => {
      const name = file.replace('.test.js', '');
      console.log(`     • npm test ${name}  (or: node scripts/tests/${file})`);
    });
  } else {
    console.log('   No .test.js files found in backend/scripts/tests/.');
  }
  process.exit(1);
}

const testFileName = targetArg.endsWith('.test.js') ? targetArg : `${targetArg}.test.js`;
const targetPath = path.resolve(testsDir, testFileName);

if (!fs.existsSync(targetPath)) {
  console.error(`✖ Test file "${testFileName}" not found in ${testsDir}`);
  const available = fs.readdirSync(testsDir).filter((f) => f.endsWith('.test.js'));
  console.log('Available tests:', available.map((f) => f.replace('.test.js', '')).join(', '));
  process.exit(1);
}

try {
  execFileSync(process.execPath, [targetPath], { stdio: 'inherit' });
} catch (error) {
  process.exit(error.status || 1);
}

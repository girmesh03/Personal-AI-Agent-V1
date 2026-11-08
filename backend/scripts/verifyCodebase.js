/**
 * @file backend/scripts/verifyCodebase.js
 * @description Static verification script checking syntax of all backend source files and validating environment rules.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { validateEnv } from '../src/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '../src');

function getAllSourceFiles(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getAllSourceFiles(fullPath));
    } else if (entry.name.endsWith('.js')) {
      results.push(fullPath);
    }
  }

  return results;
}

function runVerification() {
  console.log('🔍 Running Backend Codebase Verification...');

  // 1. Validate environment configuration
  try {
    validateEnv(process.env);
    console.log('  ✔ Environment configuration validation passed.');
  } catch (err) {
    console.error('  ✖ Environment validation failed:', err.message);
    process.exit(1);
  }

  // 2. Syntax check for all JavaScript files in backend/src
  const files = getAllSourceFiles(srcDir);
  console.log(`  🔍 Checking syntax across ${files.length} source files in backend/src...`);

  let syntaxErrors = 0;
  for (const file of files) {
    const relativePath = path.relative(srcDir, file);
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (err) {
      console.error(`  ✖ Syntax error in ${relativePath}:`, err.stderr?.toString() || err.message);
      syntaxErrors += 1;
    }
  }

  if (syntaxErrors > 0) {
    console.error(`\n✖ Backend verification failed: ${syntaxErrors} syntax error(s) detected.`);
    process.exit(1);
  }

  console.log(`  ✔ All ${files.length} backend source files passed syntax verification.`);
  console.log('✨ Backend codebase verification completed successfully.\n');
}

runVerification();

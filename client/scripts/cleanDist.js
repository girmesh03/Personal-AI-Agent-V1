/**
 * @module scripts/cleanDist
 * @description Mandatory post-build dist/ directory cleaner preserving working tree hygiene.
 * Strictly adheres to Protocol 71 (universal JSDoc consistency).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Client workspace root directory path.
 * @constant
 * @type {string}
 */
const clientRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

/**
 * Client production build output directory.
 * @constant
 * @type {string}
 */
const distPath = path.resolve(clientRoot, 'dist');

if (fs.existsSync(distPath)) {
  fs.rmSync(distPath, { recursive: true, force: true });
  console.log('🧹 client/dist/ cleaned up successfully. Working tree preserved.');
}

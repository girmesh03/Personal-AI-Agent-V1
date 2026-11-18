/**
 * @module scripts/cleanDist
 * @description Mandatory post-build dist/ directory cleaner.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const distPath = path.resolve(clientRoot, 'dist');
if (fs.existsSync(distPath)) {
  fs.rmSync(distPath, { recursive: true, force: true });
  console.log('🧹 client/dist/ cleaned up successfully. Working tree preserved.');
}

/**
 * @module config/db
 * @description Compatibility bridge re-exporting connectDB, disconnectDB, isDbConnected from infrastructure/database/connection.
 */

export * from '../infrastructure/database/connection.js';
export { default } from '../infrastructure/database/connection.js';

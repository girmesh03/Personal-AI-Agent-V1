/**
 * @module errors/CustomError
 * @description Compatibility bridge re-exporting domain error hierarchy from shared/errors/AppError.
 */

export * from '../shared/errors/AppError.js';
export { AppError as default } from '../shared/errors/AppError.js';

/**
 * @file tests/setup.js
 * @description Preload module for test execution. Enforces NODE_ENV=test before any application code loads.
 */

process.env.NODE_ENV = 'test';

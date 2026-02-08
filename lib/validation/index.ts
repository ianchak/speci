/**
 * Validation module - Centralized validation logic for paths, config, and input
 *
 * Provides reusable validators with builder pattern for composable validation.
 * Returns discriminated union ValidationResult<T> for type-safe error handling.
 */

export * from './types.js';
export { PathValidator } from './path-validator.js';
export { ConfigValidator } from './config-validator.js';
export { InputValidator } from './input-validator.js';

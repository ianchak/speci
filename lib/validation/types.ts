/**
 * Validation types for type-safe validation results
 */

/**
 * Discriminated union for validation results
 */
export type ValidationResult<T> =
  | { success: true; value: T }
  | { success: false; error: ValidationError };

/**
 * Validation error with field, message, and optional suggestions
 */
export interface ValidationError {
  field?: string;
  message: string;
  suggestions?: string[];
}

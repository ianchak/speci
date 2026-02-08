/**
 * Config validator for configuration validation
 */

import type { SpeciConfig } from '../types.js';
import type { ValidationResult, ValidationError } from './types.js';

/**
 * Check if path is safe (no directory traversal)
 *
 * @param path - Path to check
 * @returns True if path is safe
 */
function isSafePath(path: string): boolean {
  // Check for directory traversal attempts
  if (path.includes('..')) {
    return false;
  }

  // Check for absolute paths that could escape project
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) {
    return false;
  }

  return true;
}

/**
 * ConfigValidator - Validates configuration object
 *
 * @example
 * ```typescript
 * const result = new ConfigValidator(config).validate();
 * if (!result.success) {
 *   console.error(result.error.message);
 * }
 * ```
 */
export class ConfigValidator {
  private config: Partial<SpeciConfig>;
  private errors: ValidationError[] = [];

  constructor(config: Partial<SpeciConfig>) {
    this.config = config;
  }

  /**
   * Validate config version
   */
  validateVersion(): this {
    if (this.config.version && !this.config.version.startsWith('1.')) {
      this.errors.push({
        field: 'version',
        message: `Config version '${this.config.version}' is not compatible. Expected: 1.x`,
        suggestions: ['Update to version 1.x', 'Check migration guide'],
      });
    }
    return this;
  }

  /**
   * Validate paths for directory traversal
   */
  validatePaths(): this {
    if (this.config.paths) {
      for (const [key, value] of Object.entries(this.config.paths)) {
        if (value && !isSafePath(value)) {
          this.errors.push({
            field: `paths.${key}`,
            message: `Path contains directory traversal: ${value}`,
            suggestions: [
              'Use relative paths only',
              'Remove ".." from path',
              'Avoid absolute paths',
            ],
          });
        }
      }
    }
    return this;
  }

  /**
   * Validate copilot permissions
   */
  validateCopilot(): this {
    const validPermissions = ['allow-all', 'yolo', 'strict', 'none'];
    if (
      this.config.copilot?.permissions &&
      !validPermissions.includes(this.config.copilot.permissions)
    ) {
      this.errors.push({
        field: 'copilot.permissions',
        message: `Invalid copilot permissions: ${this.config.copilot.permissions}`,
        suggestions: [
          `Valid options: ${validPermissions.join(', ')}`,
          'Update speci.config.json',
        ],
      });
    }
    return this;
  }

  /**
   * Validate gate settings
   */
  validateGate(): this {
    if (this.config.gate?.maxFixAttempts !== undefined) {
      if (this.config.gate.maxFixAttempts < 1) {
        this.errors.push({
          field: 'gate.maxFixAttempts',
          message: `maxFixAttempts must be at least 1, got: ${this.config.gate.maxFixAttempts}`,
          suggestions: ['Set to 1 or higher', 'Default is 3'],
        });
      }
    }
    return this;
  }

  /**
   * Validate loop settings
   */
  validateLoop(): this {
    if (this.config.loop?.maxIterations !== undefined) {
      if (this.config.loop.maxIterations < 1) {
        this.errors.push({
          field: 'loop.maxIterations',
          message: `maxIterations must be at least 1, got: ${this.config.loop.maxIterations}`,
          suggestions: ['Set to 1 or higher', 'Default is 10'],
        });
      }
    }
    return this;
  }

  /**
   * Validate all config fields
   *
   * @returns ValidationResult with config if valid, error if invalid
   */
  validate(): ValidationResult<SpeciConfig> {
    this.validateVersion()
      .validatePaths()
      .validateCopilot()
      .validateGate()
      .validateLoop();

    if (this.errors.length > 0) {
      return { success: false, error: this.errors[0] };
    }

    return { success: true, value: this.config as SpeciConfig };
  }
}

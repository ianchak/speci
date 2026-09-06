/**
 * Config validator for configuration validation
 */

import type { SpeciConfig } from '@/types.js';
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
   * Validate copilot local model (BYOK) settings
   */
  validateLocalModel(): this {
    const localModel = this.config.copilot?.localModel;
    if (!localModel) {
      return this;
    }

    if (typeof localModel !== 'object' || localModel === null) {
      this.errors.push({
        field: 'copilot.localModel',
        message: 'copilot.localModel must be an object',
        suggestions: ['Provide an object with baseUrl and model properties'],
      });
      return this;
    }

    if (
      typeof localModel.baseUrl !== 'string' ||
      !/^https?:\/\//.test(localModel.baseUrl)
    ) {
      this.errors.push({
        field: 'copilot.localModel.baseUrl',
        message: `Invalid copilot.localModel.baseUrl: ${localModel.baseUrl}`,
        suggestions: [
          'Provide a full URL including http:// or https://',
          'Example: http://127.0.0.1:8080/v1',
        ],
      });
    }

    if (
      typeof localModel.model !== 'string' ||
      localModel.model.trim() === ''
    ) {
      this.errors.push({
        field: 'copilot.localModel.model',
        message: 'copilot.localModel.model must not be empty',
        suggestions: [
          'Set copilot.localModel.model to the model ID your local server serves',
        ],
      });
    }

    const validProviderTypes = ['openai', 'azure', 'anthropic'];
    if (
      localModel.providerType !== undefined &&
      (typeof localModel.providerType !== 'string' ||
        !validProviderTypes.includes(localModel.providerType))
    ) {
      this.errors.push({
        field: 'copilot.localModel.providerType',
        message: `Invalid copilot.localModel.providerType: ${localModel.providerType}`,
        suggestions: [`Valid options: ${validProviderTypes.join(', ')}`],
      });
    }

    if (
      localModel.apiKey !== undefined &&
      typeof localModel.apiKey !== 'string'
    ) {
      this.errors.push({
        field: 'copilot.localModel.apiKey',
        message: 'copilot.localModel.apiKey must be a string',
        suggestions: [
          'Set copilot.localModel.apiKey to your provider API key string',
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
      if (this.config.gate.maxFixAttempts < 0) {
        this.errors.push({
          field: 'gate.maxFixAttempts',
          message: `maxFixAttempts must be at least 0, got: ${this.config.gate.maxFixAttempts}`,
          suggestions: ['Set to 0 to disable fix attempts', 'Default is 3'],
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
    this.errors = [];
    this.validateVersion()
      .validatePaths()
      .validateCopilot()
      .validateLocalModel()
      .validateGate()
      .validateLoop();

    if (this.errors.length > 0) {
      return { success: false, error: this.errors[0] };
    }

    return {
      success: true,
      value: {
        version: this.config.version!,
        paths: this.config.paths!,
        copilot: this.config.copilot!,
        gate: this.config.gate!,
        loop: this.config.loop!,
      },
    };
  }
}

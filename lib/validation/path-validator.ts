/**
 * Path validator for file and directory validation
 */

import { existsSync, accessSync, constants } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import type { ValidationResult, ValidationError } from './types.js';

/**
 * PathValidator - Validates file system paths with builder pattern
 *
 * @example
 * ```typescript
 * const result = new PathValidator(filePath)
 *   .exists()
 *   .isReadable()
 *   .validate();
 *
 * if (!result.success) {
 *   console.error(result.error.message);
 *   result.error.suggestions?.forEach(s => console.log(s));
 * }
 * ```
 */
export class PathValidator {
  private path: string;
  private errors: ValidationError[] = [];

  constructor(path: string) {
    this.path = path;
  }

  /**
   * Check if path exists in filesystem
   */
  exists(): this {
    if (!existsSync(this.path)) {
      this.errors.push({
        field: 'path',
        message: `Path not found: ${this.path}`,
        suggestions: ['Check the path spelling', 'Ensure the file exists'],
      });
    }
    return this;
  }

  /**
   * Check if path is readable
   */
  isReadable(): this {
    try {
      accessSync(this.path, constants.R_OK);
    } catch {
      this.errors.push({
        field: 'path',
        message: `Path not readable: ${this.path}`,
        suggestions: ['Check file permissions'],
      });
    }
    return this;
  }

  /**
   * Check if path is writable
   */
  isWritable(): this {
    try {
      accessSync(this.path, constants.W_OK);
    } catch {
      this.errors.push({
        field: 'path',
        message: `Path not writable: ${this.path}`,
        suggestions: ['Check file permissions', 'Ensure directory exists'],
      });
    }
    return this;
  }

  /**
   * Check if path is within project root
   *
   * @param projectRoot - Absolute path to project root
   */
  isWithinProject(projectRoot: string): this {
    const absolutePath = isAbsolute(this.path)
      ? this.path
      : resolve(projectRoot, this.path);

    if (!absolutePath.startsWith(projectRoot)) {
      this.errors.push({
        field: 'path',
        message: `Path must be within project: ${this.path}`,
        suggestions: [
          'Use a relative path within the project directory',
          `Project root: ${projectRoot}`,
        ],
      });
    }
    return this;
  }

  /**
   * Validate and return result
   *
   * @returns ValidationResult with path if valid, error if invalid
   */
  validate(): ValidationResult<string> {
    if (this.errors.length > 0) {
      return { success: false, error: this.errors[0] };
    }
    return { success: true, value: this.path };
  }
}

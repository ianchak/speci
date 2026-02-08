/**
 * Input validator for command input validation
 */

import { resolve } from 'node:path';
import type { ValidationResult, ValidationError } from './types.js';
import type { IFileSystem } from '../interfaces.js';

/**
 * InputValidator - Validates command input (prompts, files, required fields)
 *
 * @example
 * ```typescript
 * const result = new InputValidator(fs)
 *   .requireInput(options.input, options.prompt)
 *   .validateFiles(options.input || [])
 *   .validate();
 * ```
 */
export class InputValidator {
  private errors: ValidationError[] = [];

  constructor(private fs: IFileSystem) {}

  /**
   * Require at least one input source (file or prompt)
   *
   * @param files - Input files array
   * @param prompt - Prompt string
   */
  requireInput(files: string[] | undefined, prompt: string | undefined): this {
    const hasFiles = files && files.length > 0;
    const hasPrompt = prompt && prompt.trim().length > 0;

    if (!hasFiles && !hasPrompt) {
      this.errors.push({
        field: 'input',
        message:
          'Missing required input: provide --input files or --prompt text',
        suggestions: [
          'Provide input files: --input file1.md file2.md',
          'Or provide prompt: --prompt "Your instructions"',
          'Both can be used together',
        ],
      });
    }
    return this;
  }

  /**
   * Validate that all input files exist
   *
   * @param files - Array of file paths to validate
   */
  validateFiles(files: string[]): this {
    for (const file of files) {
      const resolvedPath = resolve(file);
      
      // Use fs.existsSync to check file existence
      if (!this.fs.existsSync(resolvedPath)) {
        this.errors.push({
          field: 'input',
          message: `Input file not found: ${file}`,
          suggestions: [
            'Check the file path spelling',
            'Ensure the file exists',
            `Resolved path: ${resolvedPath}`,
          ],
        });
      }
    }
    return this;
  }

  /**
   * Validate and return result
   *
   * @returns ValidationResult with undefined if valid, error if invalid
   */
  validate(): ValidationResult<undefined> {
    if (this.errors.length > 0) {
      return { success: false, error: this.errors[0] };
    }
    return { success: true, value: undefined };
  }
}

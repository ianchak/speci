/**
 * Tests for TASK_015: Standardize Logging
 *
 * Verifies that all console.log/error/warn calls have been replaced with log utility
 * and that structured logging is consistent across the codebase.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Recursively find TypeScript files in a directory
 */
function findTsFiles(dir: string, base: string = dir): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...findTsFiles(fullPath, base));
    } else if (entry.endsWith('.ts')) {
      // Return relative path from base
      const relativePath = fullPath
        .substring(base.length + 1)
        .replace(/\\/g, '/');
      files.push(relativePath);
    }
  }

  return files;
}

describe('TASK_015: Standardize Logging', () => {
  describe('No Direct Console Calls in lib/', () => {
    it('should not use console.log for actual logging (formatted UI output is OK)', () => {
      const libDir = join(process.cwd(), 'lib');
      const allLibFiles = findTsFiles(libDir, libDir);
      // Exclude files that are pure UI/display code
      const libFiles = allLibFiles.filter(
        (f) =>
          f !== 'utils/logger.ts' &&
          f !== 'ui/banner-animation.ts' &&
          f !== 'cli/initialize.ts' && // Banner display is formatted UI output
          f !== 'commands/status.ts' && // Pure dashboard display
          f !== 'commands/plan.ts' && // Uses drawBox for formatted output
          f !== 'commands/task.ts' && // Uses infoBox for formatted output
          f !== 'commands/refactor.ts' && // Uses infoBox for formatted output
          f !== 'utils/command-helpers.ts' // Has spacing console.log()
      );

      const violations: string[] = [];

      for (const file of libFiles) {
        const content = readFileSync(join(libDir, file), 'utf8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
          // Skip comments
          if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
            return;
          }

          // Check for console.log (but allow empty ones for spacing)
          if (
            /\bconsole\.log\(/.test(line) &&
            !/console\.log\(\s*\)/.test(line)
          ) {
            violations.push(`lib/${file}:${index + 1} - console.log found`);
          }
        });
      }

      expect(violations).toEqual([]);
    });

    it('should not use console.error in lib/ files (except logger.ts and signals.ts)', () => {
      const libDir = join(process.cwd(), 'lib');
      const allLibFiles = findTsFiles(libDir, libDir);
      // signals.ts and banner-animation.ts may use console.error for critical scenarios
      const libFiles = allLibFiles.filter(
        (f) => f !== 'utils/logger.ts' && f !== 'ui/banner-animation.ts'
      );

      const violations: string[] = [];

      for (const file of libFiles) {
        const content = readFileSync(join(libDir, file), 'utf8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
          // Skip comments
          if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
            return;
          }

          // Check for console.error
          if (/\bconsole\.error\(/.test(line)) {
            violations.push(`lib/${file}:${index + 1} - console.error found`);
          }
        });
      }

      expect(violations).toEqual([]);
    });

    it('should not use console.warn in lib/ files (except logger.ts)', () => {
      const libDir = join(process.cwd(), 'lib');
      const allLibFiles = findTsFiles(libDir, libDir);
      const libFiles = allLibFiles.filter((f) => f !== 'utils/logger.ts');

      const violations: string[] = [];

      for (const file of libFiles) {
        const content = readFileSync(join(libDir, file), 'utf8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
          // Skip comments
          if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
            return;
          }

          // Check for console.warn
          if (/\bconsole\.warn\(/.test(line)) {
            violations.push(`lib/${file}:${index + 1} - console.warn found`);
          }
        });
      }

      expect(violations).toEqual([]);
    });
  });

  describe('Logger Import Presence', () => {
    it('should import log utility in files that need logging', () => {
      // Files that should have direct logger imports (not via DI context)
      const filesToCheck = [
        'lib/config.ts',
        'lib/copilot.ts',
        'lib/utils/signals.ts',
        'lib/utils/exit.ts',
      ];

      const missing: string[] = [];

      for (const file of filesToCheck) {
        const content = readFileSync(join(process.cwd(), file), 'utf8');

        // Should import from logger (either path alias or relative)
        const hasImport =
          content.includes("from '@/utils/logger") ||
          content.includes("from './logger.js'") ||
          content.includes('from "../utils/logger.js"');
        if (!hasImport) {
          missing.push(file);
        }
      }

      expect(missing).toEqual([]);
    });
  });

  describe('Structured Logging for Key Decisions', () => {
    it('should log config resolution decisions in config.ts', () => {
      const content = readFileSync(
        join(process.cwd(), 'lib/config.ts'),
        'utf8'
      );

      // Should have debug logging for config resolution
      expect(content).toMatch(/log\.debug.*config|configuration/i);
    });

    it('should have debug logging in copilot.ts', () => {
      const content = readFileSync(
        join(process.cwd(), 'lib/copilot.ts'),
        'utf8'
      );

      // Should have debug logging for execution
      expect(content).toMatch(/log\.debug/);
    });

    it('should log state transitions in run.ts', () => {
      const content = readFileSync(
        join(process.cwd(), 'lib/commands/run.ts'),
        'utf8'
      );

      // Should have logging for state changes
      expect(content).toMatch(/log\.(info|debug).*state|STATE/);
    });
  });

  describe('Signal Handler Logging', () => {
    it('should use log utility in signals.ts', () => {
      const content = readFileSync(
        join(process.cwd(), 'lib/utils/signals.ts'),
        'utf8'
      );

      // Should import log utility
      expect(content).toContain("from '@/utils/logger");

      // Should use log methods
      expect(content).toMatch(/log\.(info|error)/);
    });
  });

  describe('Verbosity Control', () => {
    it('should use log.debug for verbose-only messages', () => {
      const libDir = join(process.cwd(), 'lib');
      const libFiles = findTsFiles(libDir, libDir);

      let hasDebugLogs = false;

      for (const file of libFiles) {
        const content = readFileSync(join(libDir, file), 'utf8');
        if (/log\.debug\(/.test(content)) {
          hasDebugLogs = true;
          break;
        }
      }

      expect(hasDebugLogs).toBe(true);
    });

    it('should use log.info for user-facing status messages', () => {
      const commandDir = join(process.cwd(), 'lib', 'commands');
      const commandFiles = findTsFiles(commandDir, commandDir);

      let hasInfoLogs = false;

      for (const file of commandFiles) {
        const content = readFileSync(join(commandDir, file), 'utf8');
        if (/log\.info\(/.test(content) || /logger\.info\(/.test(content)) {
          hasInfoLogs = true;
          break;
        }
      }

      expect(hasInfoLogs).toBe(true);
    });

    it('should use log.error for error messages', () => {
      const libDir = join(process.cwd(), 'lib');
      const libFiles = findTsFiles(libDir, libDir);

      let hasErrorLogs = false;

      for (const file of libFiles) {
        const content = readFileSync(join(libDir, file), 'utf8');
        if (/log\.error\(/.test(content) || /logger\.error\(/.test(content)) {
          hasErrorLogs = true;
          break;
        }
      }

      expect(hasErrorLogs).toBe(true);
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadConfig,
  validateConfig,
  getDefaults,
  resolveAgentPath,
  resolveSubagentPath,
  getConfigTemplatePath,
  getAgentsTemplatePath,
  getSubagentsTemplatePath,
  type SpeciConfig,
} from '../lib/config.js';

describe('config', () => {
  let testDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original state
    originalCwd = process.cwd();
    originalEnv = { ...process.env };

    // Create isolated test directory
    testDir = join(tmpdir(), `speci-test-${Date.now()}-${Math.random()}`);
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);
  });

  afterEach(() => {
    // Restore original state
    process.chdir(originalCwd);
    process.env = originalEnv;

    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('getDefaults', () => {
    it('should return default configuration with correct structure', () => {
      const defaults = getDefaults();

      expect(defaults).toHaveProperty('version', '1.0.0');
      expect(defaults.paths).toHaveProperty('progress', 'docs/PROGRESS.md');
      expect(defaults.paths).toHaveProperty('tasks', 'docs/tasks');
      expect(defaults.paths).toHaveProperty('logs', '.speci-logs');
      expect(defaults.paths).toHaveProperty('lock', '.speci-lock');
    });

    it('should have all agents set to null by default', () => {
      const defaults = getDefaults();

      expect(defaults.agents.plan).toBeNull();
      expect(defaults.agents.task).toBeNull();
      expect(defaults.agents.refactor).toBeNull();
      expect(defaults.agents.impl).toBeNull();
      expect(defaults.agents.review).toBeNull();
      expect(defaults.agents.fix).toBeNull();
      expect(defaults.agents.tidy).toBeNull();
    });

    it('should have correct copilot defaults', () => {
      const defaults = getDefaults();

      expect(defaults.copilot.permissions).toBe('allow-all');
      expect(defaults.copilot.model).toBeNull();
      expect(defaults.copilot.extraFlags).toEqual([]);
    });

    it('should have correct gate defaults', () => {
      const defaults = getDefaults();

      expect(defaults.gate.commands).toEqual([
        'npm run lint',
        'npm run typecheck',
        'npm test',
      ]);
      expect(defaults.gate.maxFixAttempts).toBe(5);
    });

    it('should have correct loop defaults', () => {
      const defaults = getDefaults();

      expect(defaults.loop.maxIterations).toBe(100);
    });
  });

  describe('validateConfig', () => {
    it('should accept valid config', () => {
      const validConfig = getDefaults();
      const result = validateConfig(validConfig);
      expect(result).toEqual(validConfig);
    });

    it('should merge defaults for missing fields', () => {
      const partialConfig: Partial<SpeciConfig> = {
        version: '1.0.0',
        paths: {
          progress: 'custom/PROGRESS.md',
          tasks: 'docs/tasks',
          logs: '.speci-logs',
          lock: '.speci-lock',
        },
      };

      const result = validateConfig(partialConfig);

      expect(result.paths.progress).toBe('custom/PROGRESS.md');
      expect(result.paths.tasks).toBe('docs/tasks');
      expect(result.paths.logs).toBe('.speci-logs');
      expect(result.paths.lock).toBe('.speci-lock');
    });

    it('should throw error for invalid version', () => {
      const invalidConfig = {
        version: '2.0.0',
      };

      expect(() => validateConfig(invalidConfig)).toThrow(/version/i);
    });

    it('should throw error for path traversal attempts', () => {
      const invalidConfig: Partial<SpeciConfig> = {
        version: '1.0.0',
        paths: {
          progress: '../../etc/passwd',
          tasks: 'docs/tasks',
          logs: '.speci-logs',
          lock: '.speci-lock',
        },
      };

      expect(() => validateConfig(invalidConfig)).toThrow(/path/i);
    });

    it('should throw error for invalid permissions value', () => {
      const invalidConfig: Partial<SpeciConfig> = {
        version: '1.0.0',
        copilot: {
          permissions: 'invalid' as 'allow-all',
          model: null,
          extraFlags: [],
        },
      };

      expect(() => validateConfig(invalidConfig)).toThrow(/permissions/i);
    });

    it('should throw error for invalid maxFixAttempts', () => {
      const invalidConfig: Partial<SpeciConfig> = {
        version: '1.0.0',
        gate: {
          commands: [],
          maxFixAttempts: -1,
        },
      };

      expect(() => validateConfig(invalidConfig)).toThrow(/maxFixAttempts/i);
    });

    it('should throw error for invalid maxIterations', () => {
      const invalidConfig: Partial<SpeciConfig> = {
        version: '1.0.0',
        loop: {
          maxIterations: 0,
        },
      };

      expect(() => validateConfig(invalidConfig)).toThrow(/maxIterations/i);
    });
  });

  describe('loadConfig', () => {
    it('should load config from current directory', () => {
      const configData = {
        version: '1.0.0',
        paths: {
          progress: 'custom/progress.md',
        },
      };

      writeFileSync(
        join(testDir, 'speci.config.json'),
        JSON.stringify(configData)
      );

      const config = loadConfig();

      expect(config.paths.progress).toBe('custom/progress.md');
      expect(config.paths.tasks).toBe('docs/tasks'); // default
    });

    it('should walk up directories to find config', () => {
      const subDir = join(testDir, 'sub', 'nested', 'deep');
      mkdirSync(subDir, { recursive: true });

      const configData = {
        version: '1.0.0',
        paths: {
          tasks: 'custom/tasks',
        },
      };

      writeFileSync(
        join(testDir, 'speci.config.json'),
        JSON.stringify(configData)
      );

      process.chdir(subDir);
      const config = loadConfig();

      expect(config.paths.tasks).toBe('custom/tasks');
    });

    it('should return defaults when no config file exists', () => {
      const config = loadConfig();
      const defaults = getDefaults();

      expect(config).toEqual(defaults);
    });

    it('should throw descriptive error for malformed JSON', () => {
      writeFileSync(join(testDir, 'speci.config.json'), '{ invalid json }');

      expect(() => loadConfig()).toThrow(/invalid JSON/i);
    });

    it('should apply environment variable overrides', () => {
      process.env.SPECI_PROGRESS_PATH = 'env/progress.md';
      process.env.SPECI_TASKS_PATH = 'env/tasks';
      process.env.SPECI_LOGS_PATH = 'env/logs';
      process.env.SPECI_LOCK_PATH = 'env/lock';
      process.env.SPECI_MAX_ITERATIONS = '50';
      process.env.SPECI_MAX_FIX_ATTEMPTS = '3';
      process.env.SPECI_MODEL = 'gpt-4';

      const config = loadConfig();

      expect(config.paths.progress).toBe('env/progress.md');
      expect(config.paths.tasks).toBe('env/tasks');
      expect(config.paths.logs).toBe('env/logs');
      expect(config.paths.lock).toBe('env/lock');
      expect(config.loop.maxIterations).toBe(50);
      expect(config.gate.maxFixAttempts).toBe(3);
      expect(config.copilot.model).toBe('gpt-4');
    });

    it('should handle invalid environment variable values gracefully', () => {
      process.env.SPECI_MAX_ITERATIONS = 'not-a-number';

      const config = loadConfig();

      expect(config.loop.maxIterations).toBe(100); // should keep default
    });

    it('should prioritize env vars over config file', () => {
      const configData = {
        version: '1.0.0',
        paths: {
          progress: 'file/progress.md',
        },
      };

      writeFileSync(
        join(testDir, 'speci.config.json'),
        JSON.stringify(configData)
      );

      process.env.SPECI_PROGRESS_PATH = 'env/progress.md';

      const config = loadConfig();

      expect(config.paths.progress).toBe('env/progress.md');
    });
  });

  describe('resolveAgentPath', () => {
    it('should resolve to .github/copilot/agents path', () => {
      const path = resolveAgentPath('impl');

      expect(path).toContain('.github');
      expect(path).toContain('copilot');
      expect(path).toContain('agents');
      expect(path).toContain('speci-impl.agent.md');
    });

    it('should support all agent types', () => {
      const agentTypes = [
        'plan',
        'task',
        'refactor',
        'impl',
        'review',
        'fix',
        'tidy',
      ] as const;

      for (const agentType of agentTypes) {
        const path = resolveAgentPath(agentType);
        expect(path).toBeTruthy();
        expect(path).toContain(agentType);
        expect(path).toContain('.github');
        expect(path).toContain('agents');
      }
    });
  });

  describe('environment variable overrides', () => {
    it('should apply SPECI_LOG_PATH override', () => {
      process.env.SPECI_LOG_PATH = 'custom/logs';

      const config = loadConfig();

      expect(config.paths.logs).toBe('custom/logs');
    });

    it('should apply SPECI_LOGS_PATH override (alias)', () => {
      process.env.SPECI_LOGS_PATH = 'alternate/logs';

      const config = loadConfig();

      expect(config.paths.logs).toBe('alternate/logs');
    });

    it('should parse numeric env vars correctly', () => {
      process.env.SPECI_MAX_ITERATIONS = '42';
      process.env.SPECI_MAX_FIX_ATTEMPTS = '7';

      const config = loadConfig();

      expect(config.loop.maxIterations).toBe(42);
      expect(config.gate.maxFixAttempts).toBe(7);
    });

    it('should validate enum env vars', () => {
      process.env.SPECI_COPILOT_PERMISSIONS = 'strict';

      const config = loadConfig();

      expect(config.copilot.permissions).toBe('strict');
    });

    it('should handle case-insensitive enum values', () => {
      process.env.SPECI_COPILOT_PERMISSIONS = 'YOLO';

      const config = loadConfig();

      expect(config.copilot.permissions).toBe('yolo');
    });

    it('should reject invalid enum values', () => {
      process.env.SPECI_COPILOT_PERMISSIONS = 'invalid-permission';

      const config = loadConfig();

      // Should keep default value
      expect(config.copilot.permissions).toBe('allow-all');
    });

    it('should reject invalid numeric values', () => {
      process.env.SPECI_MAX_ITERATIONS = 'not-a-number';

      const config = loadConfig();

      // Should keep default value
      expect(config.loop.maxIterations).toBe(100);
    });

    it('should reject negative numeric values', () => {
      process.env.SPECI_MAX_ITERATIONS = '-5';

      const config = loadConfig();

      // Should keep default value
      expect(config.loop.maxIterations).toBe(100);
    });

    it('should treat empty env var as unset', () => {
      process.env.SPECI_PROGRESS_PATH = '';

      const config = loadConfig();

      // Should use default value
      expect(config.paths.progress).toBe('docs/PROGRESS.md');
    });

    it('should support SPECI_COPILOT_MODEL alias', () => {
      process.env.SPECI_COPILOT_MODEL = 'gpt-5';

      const config = loadConfig();

      expect(config.copilot.model).toBe('gpt-5');
    });

    it('should support SPECI_MODEL alias', () => {
      process.env.SPECI_MODEL = 'claude-opus';

      const config = loadConfig();

      expect(config.copilot.model).toBe('claude-opus');
    });

    it('should apply multiple env overrides together', () => {
      process.env.SPECI_PROGRESS_PATH = 'env/progress.md';
      process.env.SPECI_TASKS_PATH = 'env/tasks';
      process.env.SPECI_MAX_ITERATIONS = '25';
      process.env.SPECI_COPILOT_PERMISSIONS = 'strict';

      const config = loadConfig();

      expect(config.paths.progress).toBe('env/progress.md');
      expect(config.paths.tasks).toBe('env/tasks');
      expect(config.loop.maxIterations).toBe(25);
      expect(config.copilot.permissions).toBe('strict');
    });

    it('should prioritize env vars over config file', () => {
      const configData = {
        version: '1.0.0',
        paths: {
          progress: 'file/progress.md',
        },
        loop: {
          maxIterations: 200,
        },
      };

      writeFileSync(
        join(testDir, 'speci.config.json'),
        JSON.stringify(configData)
      );

      process.env.SPECI_PROGRESS_PATH = 'env/progress.md';
      process.env.SPECI_MAX_ITERATIONS = '50';

      const config = loadConfig();

      // Env vars should override file values
      expect(config.paths.progress).toBe('env/progress.md');
      expect(config.loop.maxIterations).toBe(50);
    });

    it('should warn about unknown SPECI_* env vars with typo detection', () => {
      // Set an env var with a typo
      process.env.SPECI_LOG = 'typo/logs';

      const config = loadConfig();

      // Should not apply the typo'd env var
      expect(config.paths.logs).toBe('.speci-logs');
    });

    it('should warn about unknown SPECI_* env vars without suggestion', () => {
      // Set an env var that's completely unrelated
      process.env.SPECI_COMPLETELY_UNKNOWN_VAR = 'value';

      const config = loadConfig();

      // Should still load successfully
      expect(config).toBeTruthy();
    });
  });

  describe('priority order', () => {
    it('should follow priority: default < file < env', () => {
      // Write config file
      const configData = {
        version: '1.0.0',
        paths: {
          progress: 'file/progress.md',
          tasks: 'file/tasks',
          logs: 'file/logs',
        },
      };

      writeFileSync(
        join(testDir, 'speci.config.json'),
        JSON.stringify(configData)
      );

      // Set env var
      process.env.SPECI_PROGRESS_PATH = 'env/progress.md';

      const config = loadConfig();

      // Env should override file
      expect(config.paths.progress).toBe('env/progress.md');
      // File should override default
      expect(config.paths.tasks).toBe('file/tasks');
      expect(config.paths.logs).toBe('file/logs');
      // Default should be used when nothing else specified
      expect(config.paths.lock).toBe('.speci-lock');
    });
  });

  describe('edge cases', () => {
    it('should handle zero as valid numeric value', () => {
      // Setting to 0 should be rejected as it's < 1
      process.env.SPECI_MAX_ITERATIONS = '0';

      const config = loadConfig();

      // Should keep default due to validation (< 0 check)
      expect(config.loop.maxIterations).toBe(100);
    });

    it('should handle single-character string paths', () => {
      process.env.SPECI_LOCK_PATH = 'x';

      const config = loadConfig();

      expect(config.paths.lock).toBe('x');
    });

    it('should handle very long string values', () => {
      const longPath = 'a'.repeat(1000);
      process.env.SPECI_PROGRESS_PATH = longPath;

      const config = loadConfig();

      expect(config.paths.progress).toBe(longPath);
    });

    it('should handle max safe integer for numeric values', () => {
      process.env.SPECI_MAX_ITERATIONS = String(Number.MAX_SAFE_INTEGER);

      const config = loadConfig();

      expect(config.loop.maxIterations).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle undefined vs empty string differently', () => {
      process.env.SPECI_PROGRESS_PATH = '';

      const config = loadConfig();

      // Empty string should be treated as unset
      expect(config.paths.progress).toBe('docs/PROGRESS.md');
    });
  });

  describe('performance', () => {
    it('should load config in under 50ms', () => {
      const configData = {
        version: '1.0.0',
      };

      writeFileSync(
        join(testDir, 'speci.config.json'),
        JSON.stringify(configData)
      );

      const startTime = performance.now();
      loadConfig();
      const endTime = performance.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(50);
    });
  });

  describe('resolveAgentPath', () => {
    it('should return .github/copilot/agents path', () => {
      const path = resolveAgentPath('impl');

      expect(path).toContain('.github');
      expect(path).toContain('copilot');
      expect(path).toContain('agents');
      expect(path).toContain('speci-impl.agent.md');
    });

    it('should build correct path for each agent type', () => {
      const agentTypes = [
        'plan',
        'task',
        'refactor',
        'impl',
        'review',
        'fix',
        'tidy',
      ] as const;

      for (const agentType of agentTypes) {
        const path = resolveAgentPath(agentType);
        expect(path).toContain(`speci-${agentType}.agent.md`);
      }
    });
  });

  describe('resolveSubagentPath', () => {
    it('should return path for existing task subagent', () => {
      const path = resolveSubagentPath('task_generator');

      expect(path).toContain('templates');
      expect(path).toContain('subagents');
      expect(path).toContain('task_generator.prompt.md');
    });

    it('should return path for existing plan subagent', () => {
      const path = resolveSubagentPath('plan_requirements_deep_dive');

      expect(path).toContain('templates');
      expect(path).toContain('plan_requirements_deep_dive.prompt.md');
    });

    it('should return path for existing refactor subagent', () => {
      const path = resolveSubagentPath('refactor_analyze_structure');

      expect(path).toContain('templates');
      expect(path).toContain('refactor_analyze_structure.prompt.md');
    });

    it('should throw for nonexistent subagent', () => {
      expect(() => {
        resolveSubagentPath('nonexistent_subagent');
      }).toThrow('Subagent prompt not found');
    });
  });

  describe('getConfigTemplatePath', () => {
    it('should return path to config template', () => {
      const path = getConfigTemplatePath();

      expect(path).toContain('templates');
      expect(path).toContain('speci.config.json');
    });
  });

  describe('getAgentsTemplatePath', () => {
    it('should return path to agents template directory', () => {
      const path = getAgentsTemplatePath();

      expect(path).toContain('templates');
      expect(path).toContain('agents');
    });
  });

  describe('getSubagentsTemplatePath', () => {
    it('should return path to subagents template directory', () => {
      const path = getSubagentsTemplatePath();

      expect(path).toContain('templates');
      expect(path).toContain('subagents');
    });
  });
});

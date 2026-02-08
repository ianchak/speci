import { describe, it, expect } from 'vitest';
import { ConfigValidator } from '@/validation/config-validator.js';
import type { SpeciConfig } from '@/types.js';

describe('ConfigValidator', () => {
  const validConfig: SpeciConfig = {
    version: '1.0.0',
    paths: {
      progress: 'docs/PROGRESS.md',
      tasks: 'docs/tasks',
      logs: 'logs',
      lock: '.speci-lock',
    },
    agents: {
      plan: null,
      task: null,
      refactor: null,
      impl: null,
      review: null,
      fix: null,
      tidy: null,
    },
    gate: {
      commands: ['npm test'],
      maxFixAttempts: 3,
      strategy: 'sequential',
    },
    loop: {
      maxIterations: 10,
    },
    copilot: {
      permissions: 'allow-all',
      model: null,
      models: {
        plan: null,
        task: null,
        refactor: null,
        impl: null,
        review: null,
        fix: null,
        tidy: null,
      },
      extraFlags: [],
    },
  };

  describe('validateVersion()', () => {
    it('should accept version 1.x', () => {
      const config = { ...validConfig, version: '1.0.0' };
      const result = new ConfigValidator(config).validateVersion().validate();

      expect(result.success).toBe(true);
    });

    it('should accept version 1.2.3', () => {
      const config = { ...validConfig, version: '1.2.3' };
      const result = new ConfigValidator(config).validateVersion().validate();

      expect(result.success).toBe(true);
    });

    it('should reject version 2.x', () => {
      const config = { ...validConfig, version: '2.0.0' };
      const result = new ConfigValidator(config).validateVersion().validate();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.field).toBe('version');
        expect(result.error.message).toContain('not compatible');
        expect(result.error.suggestions).toContain('Update to version 1.x');
      }
    });

    it('should accept undefined version', () => {
      const config = { ...validConfig, version: undefined };
      const result = new ConfigValidator(config).validateVersion().validate();

      expect(result.success).toBe(true);
    });
  });

  describe('validatePaths()', () => {
    it('should accept safe relative paths', () => {
      const config = {
        ...validConfig,
        paths: {
          progress: 'docs/PROGRESS.md',
          tasks: 'docs/tasks',
          logs: 'logs/speci.log',
          lock: '.speci-lock',
          agents: 'templates/agents',
        },
      };
      const result = new ConfigValidator(config).validatePaths().validate();

      expect(result.success).toBe(true);
    });

    it('should reject paths with directory traversal', () => {
      const config = {
        ...validConfig,
        paths: {
          ...validConfig.paths,
          progress: '../outside/PROGRESS.md',
        },
      };
      const result = new ConfigValidator(config).validatePaths().validate();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.field).toContain('paths.');
        expect(result.error.message).toContain('directory traversal');
        expect(result.error.suggestions).toContain('Use relative paths only');
      }
    });

    it('should reject absolute paths', () => {
      const config = {
        ...validConfig,
        paths: {
          ...validConfig.paths,
          logs: '/absolute/path/logs',
        },
      };
      const result = new ConfigValidator(config).validatePaths().validate();

      expect(result.success).toBe(false);
    });

    it('should reject Windows absolute paths', () => {
      const config = {
        ...validConfig,
        paths: {
          ...validConfig.paths,
          logs: 'C:\\absolute\\path',
        },
      };
      const result = new ConfigValidator(config).validatePaths().validate();

      expect(result.success).toBe(false);
    });
  });

  describe('validateCopilot()', () => {
    it('should accept valid permissions', () => {
      const permissions: Array<'allow-all' | 'yolo' | 'strict' | 'none'> = [
        'allow-all',
        'yolo',
        'strict',
        'none',
      ];

      for (const perm of permissions) {
        const config = {
          ...validConfig,
          copilot: { ...validConfig.copilot, permissions: perm },
        };
        const result = new ConfigValidator(config).validateCopilot().validate();

        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid permissions', () => {
      const config = {
        ...validConfig,
        copilot: {
          ...validConfig.copilot,
          permissions: 'invalid' as 'allow-all',
        },
      };
      const result = new ConfigValidator(config).validateCopilot().validate();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.field).toBe('copilot.permissions');
        expect(result.error.message).toContain('Invalid copilot permissions');
        expect(result.error.suggestions?.[0]).toContain('Valid options:');
      }
    });

    it('should accept undefined permissions', () => {
      const config = {
        ...validConfig,
        copilot: {
          ...validConfig.copilot,
          permissions: undefined as unknown as 'allow-all',
        },
      };
      const result = new ConfigValidator(config).validateCopilot().validate();

      expect(result.success).toBe(true);
    });
  });

  describe('validateGate()', () => {
    it('should accept maxFixAttempts >= 1', () => {
      const attempts = [1, 2, 3, 5, 10];

      for (const max of attempts) {
        const config = {
          ...validConfig,
          gate: { ...validConfig.gate, maxFixAttempts: max },
        };
        const result = new ConfigValidator(config).validateGate().validate();

        expect(result.success).toBe(true);
      }
    });

    it('should reject maxFixAttempts < 1', () => {
      const config = {
        ...validConfig,
        gate: { ...validConfig.gate, maxFixAttempts: 0 },
      };
      const result = new ConfigValidator(config).validateGate().validate();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.field).toBe('gate.maxFixAttempts');
        expect(result.error.message).toContain('must be at least 1');
      }
    });

    it('should reject negative maxFixAttempts', () => {
      const config = {
        ...validConfig,
        gate: { ...validConfig.gate, maxFixAttempts: -1 },
      };
      const result = new ConfigValidator(config).validateGate().validate();

      expect(result.success).toBe(false);
    });
  });

  describe('validateLoop()', () => {
    it('should accept maxIterations >= 1', () => {
      const iterations = [1, 5, 10, 50, 100];

      for (const max of iterations) {
        const config = {
          ...validConfig,
          loop: { ...validConfig.loop, maxIterations: max },
        };
        const result = new ConfigValidator(config).validateLoop().validate();

        expect(result.success).toBe(true);
      }
    });

    it('should reject maxIterations < 1', () => {
      const config = {
        ...validConfig,
        loop: { ...validConfig.loop, maxIterations: 0 },
      };
      const result = new ConfigValidator(config).validateLoop().validate();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.field).toBe('loop.maxIterations');
        expect(result.error.message).toContain('must be at least 1');
      }
    });
  });

  describe('validate() - full validation', () => {
    it('should validate all fields', () => {
      const result = new ConfigValidator(validConfig).validate();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual(validConfig);
      }
    });

    it('should return first error when multiple validations fail', () => {
      const badConfig = {
        ...validConfig,
        version: '2.0.0', // Invalid version
        paths: {
          ...validConfig.paths,
          progress: '../bad/path', // Invalid path
        },
      };
      const result = new ConfigValidator(badConfig).validate();

      expect(result.success).toBe(false);
      if (!result.success) {
        // Should get version error first (validated first)
        expect(result.error.field).toBe('version');
      }
    });

    it('should validate partial config', () => {
      const partialConfig: Partial<SpeciConfig> = {
        version: '1.0.0',
        gate: {
          commands: [],
          maxFixAttempts: 5,
          strategy: 'sequential',
        },
      };
      const result = new ConfigValidator(partialConfig).validate();

      expect(result.success).toBe(true);
    });
  });
});

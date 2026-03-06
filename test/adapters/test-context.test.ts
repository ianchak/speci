import { describe, expect, it } from 'vitest';
import {
  createMockProcess,
  mockAgentFailure,
  mockAgentSuccess,
} from '@/adapters/test-context.js';
import type { AgentRunResult } from '@/types.js';

describe('mockAgentSuccess', () => {
  it('returns success with exitCode 0 by default', () => {
    expect(mockAgentSuccess()).toEqual({ isSuccess: true, exitCode: 0 });
  });

  it('is assignable to AgentRunResult', () => {
    const result: AgentRunResult = mockAgentSuccess(0);
    expect(result).toEqual({ isSuccess: true, exitCode: 0 });
  });
});

describe('mockAgentFailure', () => {
  it('returns failure with default exitCode and error', () => {
    expect(mockAgentFailure()).toEqual({
      isSuccess: false,
      exitCode: 1,
      error: 'Agent run failed',
    });
  });

  it('returns failure with custom exitCode and error', () => {
    expect(mockAgentFailure(2, 'timeout')).toEqual({
      isSuccess: false,
      exitCode: 2,
      error: 'timeout',
    });
  });
});

describe('createMockProcess streams', () => {
  it('provides callable stdout stream methods', () => {
    const proc = createMockProcess();
    expect(() => proc.stdout.write('hello')).not.toThrow();
    expect(() => proc.stdout.on('close', () => undefined)).not.toThrow();
    expect(() => proc.stdout.off('close', () => undefined)).not.toThrow();
  });

  it('provides callable stdin stream methods', () => {
    const proc = createMockProcess();
    expect(() => proc.stdin.setRawMode(true)).not.toThrow();
    expect(() => proc.stdin.resume()).not.toThrow();
    expect(() => proc.stdin.on('data', () => undefined)).not.toThrow();
    expect(() => proc.stdin.off('data', () => undefined)).not.toThrow();
  });
});

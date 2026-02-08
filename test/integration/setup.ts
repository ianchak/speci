/**
 * Integration Test Setup and Utilities
 *
 * Provides shared helpers for creating isolated test environments
 * and mocking external dependencies (like Copilot CLI).
 */

import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { SpeciConfig } from '@/config.js';

/**
 * Test project configuration
 */
export interface TestProject {
  root: string;
  configPath: string;
  tasksDir: string;
  logsDir: string;
  progressPath: string;
  cleanup: () => Promise<void>;
}

/**
 * Create an isolated test project directory
 * @returns Test project configuration with cleanup function
 */
export async function createTestProject(): Promise<TestProject> {
  const root = await mkdtemp(join(tmpdir(), 'speci-integration-'));

  const configPath = join(root, 'speci.config.json');
  const tasksDir = join(root, 'docs', 'tasks');
  const logsDir = join(root, 'logs');
  const progressPath = join(root, 'docs', 'PROGRESS.md');

  // Create directories
  await mkdir(join(root, 'docs'), { recursive: true });
  await mkdir(tasksDir, { recursive: true });
  await mkdir(logsDir, { recursive: true });

  // Create a default config file
  const defaultConfig: SpeciConfig = {
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
      commands: ['npm run lint', 'npm run typecheck', 'npm run test'],
      maxFixAttempts: 3,
    },
    copilot: {
      permissions: 'allow-all',
      model: 'claude-sonnet-4',
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
    loop: {
      maxIterations: 10,
    },
  };

  await writeFile(configPath, JSON.stringify(defaultConfig, null, 2));

  const cleanup = async () => {
    try {
      await rm(root, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors in tests
      console.error(`Failed to cleanup test project: ${root}`, error);
    }
  };

  return {
    root,
    configPath,
    tasksDir,
    logsDir,
    progressPath,
    cleanup,
  };
}

/**
 * Create a mock PROGRESS.md file
 * @param path - Path to write the file
 * @param tasks - Optional tasks to include
 */
export async function createMockProgress(
  path: string,
  tasks: Array<{ id: string; title: string; status: string }> = []
): Promise<void> {
  const content = `# Project Progress

## Overview

| Property         | Value                    |
| ---------------- | ------------------------ |
| **Project Name** | Test Project             |
| **Plan File**    | docs/REFACTORING_PLAN.md |

---

## Milestone: M0 - Test

| Task ID | Title | Status | Review Status | Priority | Complexity | Dependencies | Assigned To | Attempts |
| ------- | ----- | ------ | ------------- | -------- | ---------- | ------------ | ----------- | -------- |
${tasks.map((t) => `| ${t.id} | ${t.title} | ${t.status} | — | HIGH | S (≤2h) | None | — | 0 |`).join('\n')}

---

## Subagent Tracking

Last Subagent ID: SA-20260207-001

---

## Review Tracking

Last Review ID: RA-20260207-001

---

## Agent Handoff

### For Reviewer

| Field             | Value |
| ----------------- | ----- |
| Task              | -     |
| Impl Agent        | -     |
| Files Changed     | -     |
| Tests Added       | -     |
| Rework?           | -     |
| Focus Areas       | -     |
| Known Limitations | -     |
| Gate Results      | -     |
`;

  await writeFile(path, content);
}

/**
 * Create a mock task file
 * @param path - Path to write the file
 * @param taskId - Task ID
 * @param title - Task title
 */
export async function createMockTask(
  path: string,
  taskId: string,
  title: string
): Promise<void> {
  const content = `# ${taskId}: ${title}

## Metadata

| Field            | Value            |
| ---------------- | ---------------- |
| **Milestone**    | M0: Test         |
| **Priority**     | High             |
| **Complexity**   | S (≤2h)          |
| **Dependencies** | None             |

## Description

Test task for integration testing.

## Acceptance Criteria

- [ ] Test criterion 1
- [ ] Test criterion 2

## Technical Approach

This is a test task.
`;

  await writeFile(path, content);
}

/**
 * Read file contents
 * @param path - Path to read
 * @returns File contents
 */
export async function readTestFile(path: string): Promise<string> {
  return readFile(path, 'utf-8');
}

/**
 * Check if file exists
 * @param path - Path to check
 * @returns True if file exists
 */
export function fileExists(path: string): boolean {
  return existsSync(path);
}

/**
 * Create a mock Copilot CLI executable for testing
 * This creates a simple node script that returns success/failure
 * @param path - Path to create the mock CLI
 * @param shouldSucceed - Whether the mock CLI should succeed or fail
 */
export async function createMockCopilotCli(
  path: string,
  shouldSucceed: boolean = true
): Promise<void> {
  const script = `#!/usr/bin/env node
// Mock Copilot CLI for integration testing
const args = process.argv.slice(2);
console.log('Mock Copilot CLI called with:', args);

if (${shouldSucceed}) {
  console.log('Task completed successfully!');
  process.exit(0);
} else {
  console.error('Task failed!');
  process.exit(1);
}
`;

  await writeFile(path, script, { mode: 0o755 });
}

/**
 * Wait for a condition to become true
 * @param condition - Function that returns true when condition is met
 * @param timeout - Maximum time to wait in milliseconds
 * @param interval - Polling interval in milliseconds
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await condition();
    if (result) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

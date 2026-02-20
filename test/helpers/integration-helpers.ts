import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { SpeciConfig } from '@/config.js';

export interface IntegrationProject {
  root: string;
  config: SpeciConfig;
  inputFile: string;
  planFile: string;
  progressFile: string;
  lockFile: string;
  cleanup: () => Promise<void>;
}

const DEFAULT_PROGRESS = `# Integration Progress

## Overview

| Property         | Value                             |
| ---------------- | --------------------------------- |
| **Project Name** | Integration Test Project          |
| **Plan File**    | docs/plan.md                      |

---

## Milestone: M1

| Task ID  | Title     | File                        | Status      | Review Status | Priority | Complexity | Dependencies | Assigned To | Attempts |
| -------- | --------- | --------------------------- | ----------- | ------------- | -------- | ---------- | ------------ | ----------- | -------- |
| TASK_001 | Seed Task | TASK_001_seed_task.md       | NOT STARTED | —             | HIGH     | S (≤2h)    | None         |             |          |

---

## Subagent Tracking

Last Subagent ID: SA-20260220-000

---

## Review Tracking

Last Review ID: RA-20260220-000
`;

export async function createYoloIntegrationProject(): Promise<IntegrationProject> {
  const root = await mkdtemp(join(tmpdir(), 'speci-yolo-integration-'));
  const docsDir = join(root, 'docs');
  const tasksDir = join(docsDir, 'tasks');
  const logsDir = join(root, 'logs');
  const progressFile = join(docsDir, 'PROGRESS.md');
  const planFile = join(docsDir, 'plan.md');
  const inputFile = join(docsDir, 'requirements.md');
  const lockFile = join(root, '.speci-lock');

  await mkdir(tasksDir, { recursive: true });
  await mkdir(logsDir, { recursive: true });
  await writeFile(progressFile, DEFAULT_PROGRESS);
  await writeFile(planFile, '# Plan\n\nInitial test plan');
  await writeFile(inputFile, '# Requirements\n\nBuild test feature');
  await writeFile(join(tasksDir, 'TASK_001_seed_task.md'), '# Seed Task');

  const config: SpeciConfig = {
    version: '1.0.0',
    paths: {
      progress: progressFile,
      tasks: tasksDir,
      logs: logsDir,
      lock: lockFile,
    },
    copilot: {
      permissions: 'allow-all',
      models: {
        plan: 'claude-opus-4.6',
        task: 'claude-sonnet-4.5',
        refactor: 'claude-sonnet-4.5',
        impl: 'gpt-5.3-codex',
        review: 'claude-sonnet-4.5',
        fix: 'claude-sonnet-4.5',
        tidy: 'gpt-5.2',
      },
      extraFlags: [],
    },
    gate: {
      commands: ['npm run lint', 'npm run typecheck', 'npm run test'],
      maxFixAttempts: 3,
    },
    loop: {
      maxIterations: 10,
    },
  };

  return {
    root,
    config,
    inputFile,
    planFile,
    progressFile,
    lockFile,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}

export async function writeProgressFile(
  project: IntegrationProject,
  content: string
): Promise<void> {
  await writeFile(project.progressFile, content);
}

export async function readProjectFile(path: string): Promise<string> {
  return readFile(path, 'utf-8');
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function waitForPath(
  path: string,
  timeoutMs: number = 1000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await pathExists(path)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for path: ${path}`);
}

# speci

[![CI](https://github.com/ianchak/speci/actions/workflows/ci.yml/badge.svg)](https://github.com/ianchak/speci/actions/workflows/ci.yml)
[![Release](https://github.com/ianchak/speci/actions/workflows/release.yml/badge.svg)](https://github.com/ianchak/speci/actions/workflows/release.yml)
[![npm version](https://img.shields.io/npm/v/speci.svg)](https://www.npmjs.com/package/speci)
[![Node.js](https://img.shields.io/node/v/speci.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AI-powered implementation loop orchestrator for GitHub Copilot. Speci automates development workflows by dispatching Copilot agents to plan, implement, review, and fix code, with quality gate validation (lint, typecheck, test) between each step.

## How It Works

Speci operates as an autonomous loop that reads a PROGRESS.md file to determine what needs to be done, then dispatches the appropriate Copilot agent:

1. **Plan** your feature or change (generates a structured plan)
2. **Task** breaks the plan into trackable tasks with a PROGRESS.md file
3. **Run** enters the implementation loop:
   - Tasks marked WORK_LEFT get an implementation agent
   - Gate validation runs your lint, typecheck, and test commands
   - If gates fail, a fix agent attempts repairs (up to a configurable limit)
   - Tasks marked IN_REVIEW get a review agent
   - Tasks marked BLOCKED get a tidy agent
   - The loop continues until all tasks are DONE or limits are reached

### Workflow Diagram

```
  ┌─────────────────────────────────────────────────────────────────────┐
  │                        speci workflow                               │
  └─────────────────────────────────────────────────────────────────────┘

  ┌──────────┐      ┌──────────┐      ┌──────────────────────────────┐
  │          │      │          │      │          speci run           │
  │  plan    ├─────►│  task    ├─────►│    (implementation loop)     │
  │  agent   │      │  agent   │      │                              │
  └──────────┘      └──────────┘      └──────────────┬───────────────┘
   Generates a       Breaks plan                     │
   structured        into tasks &                    ▼
   plan              PROGRESS.md          ┌─────────────────────┐
                                          │  Read PROGRESS.md   │◄─────────────┐
                                          │  Determine STATE    │              │
                                          └────────┬────────────┘              │
                         ┌─────────────────────────┼──────────────────┐        │
                         │                         │                  │        │
                         ▼                         ▼                  ▼        │
                  ┌─────────────┐         ┌──────────────┐   ┌────────────┐    │
                  │  WORK_LEFT  │         │  IN_REVIEW   │   │  BLOCKED   │    │
                  └──────┬──────┘         └──────┬───────┘   └─────┬──────┘    │
                         │                       │                 │           │
                         ▼                       ▼                 ▼           │
                  ┌─────────────┐         ┌──────────────┐   ┌────────────┐    │
                  │    impl     │         │   review     │   │   tidy     │    │
                  │    agent    │         │   agent      │   │   agent    │    │
                  └──────┬──────┘         └──────┬───────┘   └─────┬──────┘    │
                         │                       │                 │           │
                         ▼                       │                 │           │
                  ┌─────────────┐                │                 │           │
                  │  run gates  │                │                 │           │
                  │ lint/type/  │                │                 │           │
                  │   test      │                │                 │           │
                  └──┬──────┬───┘                │                 │           │
                     │      │                    │                 │           │
                pass ▼      ▼ fail               │                 │           │
                     │ ┌─────────┐               │                 │           │
                     │ │  fix    │               │                 │           │
                     │ │  agent  │               │                 │           │
                     │ └────┬────┘               │                 │           │
                     │      │                    │                 │           │
                     │      ▼                    │                 │           │
                     │ ┌─────────┐               │                 │           │
                     │ │ re-run  │               │                 │           │
                     │ │ gates   ├──► (retry up  │                 │           │
                     │ └─────────┘    to N times)│                 │           │
                     │                           │                 │           │
                     └───────────┬───────────────┘                 │           │
                                 │                                 │           │
                                 └────────────┬────────────────────┘           │
                                              │                                │
                                              ▼                                │
                                    ┌───────────────────┐                      │
                                    │  State changed?   │                      │
                                    │  DONE? ─► exit    │                      │
                                    │  otherwise ───────┼──────────────────────┘
                                    └───────────────────┘
```

### Agent Summary

| Agent      | Triggered By     | Purpose                                        |
| ---------- | ---------------- | ---------------------------------------------- |
| `plan`     | `speci plan`     | Generate a structured implementation plan      |
| `task`     | `speci task`     | Break plan into tasks and create PROGRESS.md   |
| `refactor` | `speci refactor` | Analyze codebase for refactoring opportunities |
| `impl`     | WORK_LEFT        | Implement the next task                        |
| `review`   | IN_REVIEW        | Review completed work for correctness          |
| `fix`      | Gate failure     | Repair lint, typecheck, or test failures       |
| `tidy`     | BLOCKED          | Clean up or unblock dependencies               |

## Quick Start

```bash
# Initialize speci in your project
npx speci init

# Create a plan from a prompt or design doc
npx speci plan -p "Add user authentication with JWT"

# Break the plan into tasks and generate PROGRESS.md
npx speci task --plan docs/plan.md

# Run the implementation loop
npx speci run
```

## Prerequisites

- **Node.js** 18.0.0 or later
- **GitHub Copilot CLI** installed and authenticated
- **Git repository** initialized in your project

### Install GitHub Copilot CLI

```bash
# Install via npm (all platforms)
npm install -g @github/copilot

# Or via WinGet (Windows)
winget install GitHub.Copilot

# Or via Homebrew (macOS/Linux)
brew install copilot-cli
```

On first launch, use the `/login` slash command to authenticate, or set the `GH_TOKEN` environment variable with a personal access token.

See https://docs.github.com/en/copilot/how-tos/copilot-cli/install-copilot-cli for more details.

## Installation

```bash
# Run directly without installing
npx speci --help

# Or install globally
npm install -g speci
```

## Commands

All commands support `-v, --verbose` for detailed output and `--no-color` to disable colored output.

### `speci init` (alias: `i`)

Initialize speci in your current project. Creates configuration files, task directories, and Copilot agent definitions.

```bash
npx speci init
```

**Options:**

| Flag                  | Description                                   |
| --------------------- | --------------------------------------------- |
| `-u, --update-agents` | Update agent files even if they already exist |

**Creates:**

- `speci.config.json` in the project root
- `docs/tasks/` directory for task definitions
- `.speci-logs/` directory for execution logs
- `.github/agents/` directory with Copilot agent definitions

```bash
# Update bundled agent files to the latest version
npx speci init --update-agents
```

### `speci plan` (alias: `p`)

Generate an implementation plan using Copilot. Requires at least `--prompt` or `--input`.

```bash
npx speci plan -p "Build a REST API for user authentication"
```

**Options:**

| Flag                     | Description                                  |
| ------------------------ | -------------------------------------------- |
| `-p, --prompt <text>`    | Initial prompt describing what to plan       |
| `-i, --input <files...>` | Input files for context (design docs, specs) |
| `-o, --output <path>`    | Save plan to a specific file                 |

```bash
# Plan using a design doc as context
npx speci plan -i docs/design.md

# Combine input files with a prompt
npx speci plan -i spec.md -p "Focus on the authentication module"

# Save plan to a specific file
npx speci plan -i design.md -o docs/plan.md
```

### `speci task` (alias: `t`)

Generate task definitions and a PROGRESS.md file from an implementation plan.

```bash
npx speci task --plan docs/plan.md
```

**Options:**

| Flag                | Description                  |
| ------------------- | ---------------------------- |
| `-p, --plan <path>` | Path to plan file (required) |

### `speci refactor` (alias: `r`)

Analyze the codebase for refactoring opportunities using Copilot.

```bash
npx speci refactor
```

**Options:**

| Flag                  | Description                          |
| --------------------- | ------------------------------------ |
| `-s, --scope <path>`  | Directory or glob pattern to analyze |
| `-o, --output <path>` | Save refactoring plan to a file      |

```bash
# Analyze a specific directory
npx speci refactor --scope src/

# Analyze only TypeScript files
npx speci r -s "src/**/*.ts"

# Save the refactoring plan
npx speci refactor -o docs/refactor-plan.md
```

### `speci status` (alias: `s`)

Show current loop state and task statistics. By default, opens a live fullscreen dashboard that refreshes automatically. Press `q` or `ESC` to exit the dashboard.

```bash
npx speci status
```

**Options:**

| Flag     | Description                                 |
| -------- | ------------------------------------------- |
| `--json` | Output status as JSON and exit              |
| `--once` | Show status once and exit (non-interactive) |

**Status fields:**

- Current loop state (WORK_LEFT, IN_REVIEW, BLOCKED, DONE)
- Task statistics (total, completed, remaining, in review, blocked)
- Lock status and current task

```bash
# Static one-time output
npx speci status --once

# Machine-readable output for scripts
npx speci s --json
```

### `speci run`

Execute the implementation loop. This is the main command that drives autonomous development. It acquires a lock file to prevent concurrent runs and logs all agent activity to `.speci-logs/`.

```bash
npx speci run
```

**Options:**

| Flag                   | Description                             |
| ---------------------- | --------------------------------------- |
| `--max-iterations <n>` | Maximum loop iterations (default: 100)  |
| `--dry-run`            | Show what would execute without running |
| `--force`              | Override an existing lock file          |
| `-y, --yes`            | Skip the confirmation prompt            |

This command has no short alias, by design, to prevent accidental execution.

```bash
# Preview what would happen
npx speci run --dry-run

# Limit to 10 iterations
npx speci run --max-iterations 10

# Skip confirmation and force past a stale lock
npx speci run -y --force
```

## Configuration

### speci.config.json

Created by `speci init`. Speci discovers this file by walking up from the current directory, similar to how ESLint finds its config.

```json
{
  "version": "1.0.0",
  "paths": {
    "progress": "docs/PROGRESS.md",
    "tasks": "docs/tasks",
    "logs": ".speci-logs",
    "lock": ".speci-lock"
  },
  "copilot": {
    "permissions": "allow-all",
    "models": {
      "plan": "claude-opus-4.6",
      "task": "claude-sonnet-4.5",
      "refactor": "claude-sonnet-4.5",
      "impl": "gpt-5.3-codex",
      "review": "claude-sonnet-4.5",
      "fix": "claude-sonnet-4.5",
      "tidy": "gpt-5.2"
    },
    "extraFlags": []
  },
  "gate": {
    "commands": ["npm run lint", "npm run typecheck", "npm test"],
    "maxFixAttempts": 5,
    "strategy": "sequential"
  },
  "loop": {
    "maxIterations": 100
  }
}
```

### Configuration Reference

**paths** - File and directory locations used by speci.

| Field      | Default            | Description                          |
| ---------- | ------------------ | ------------------------------------ |
| `progress` | `docs/PROGRESS.md` | Path to the progress tracking file   |
| `tasks`    | `docs/tasks`       | Directory for task definition files  |
| `logs`     | `.speci-logs`      | Directory for execution logs         |
| `lock`     | `.speci-lock`      | Lock file to prevent concurrent runs |

**copilot** - Copilot CLI settings.

| Field         | Default     | Description                                               |
| ------------- | ----------- | --------------------------------------------------------- |
| `permissions` | `allow-all` | Permission mode: `allow-all`, `yolo`, `strict`, or `none` |
| `models`      | (see above) | Model to use for each agent type                          |
| `extraFlags`  | `[]`        | Additional flags passed to the Copilot CLI                |

**gate** - Quality gate configuration. Gate commands run after each implementation step.

| Field            | Default                 | Description                                           |
| ---------------- | ----------------------- | ----------------------------------------------------- |
| `commands`       | `["npm run lint", ...]` | Shell commands to run as quality gates                |
| `maxFixAttempts` | `5`                     | Maximum automatic fix attempts after gate failures    |
| `strategy`       | `sequential`            | `sequential` or `parallel` execution of gate commands |

Parallel strategy can be 30-50% faster but requires that gate commands are independent (no shared resources like lock files or ports).

**loop** - Loop behavior settings.

| Field           | Default | Description                             |
| --------------- | ------- | --------------------------------------- |
| `maxIterations` | `100`   | Maximum loop iterations before stopping |

### Environment Variables

Environment variables override corresponding config file settings.

| Variable                    | Config Path           | Description                          |
| --------------------------- | --------------------- | ------------------------------------ |
| `SPECI_PROGRESS_PATH`       | `paths.progress`      | Path to PROGRESS.md file             |
| `SPECI_TASKS_PATH`          | `paths.tasks`         | Path to tasks directory              |
| `SPECI_LOG_PATH`            | `paths.logs`          | Path to log directory                |
| `SPECI_LOGS_PATH`           | `paths.logs`          | Alias for `SPECI_LOG_PATH`           |
| `SPECI_LOCK_PATH`           | `paths.lock`          | Path to lock file                    |
| `SPECI_MAX_ITERATIONS`      | `loop.maxIterations`  | Maximum loop iterations              |
| `SPECI_MAX_FIX_ATTEMPTS`    | `gate.maxFixAttempts` | Maximum fix attempts                 |
| `SPECI_COPILOT_PERMISSIONS` | `copilot.permissions` | Permission mode                      |
| `SPECI_DEBUG`               | N/A                   | Enable debug logging (`1` or `true`) |
| `SPECI_NO_ANIMATION`        | N/A                   | Disable banner animation             |
| `NO_COLOR`                  | N/A                   | Disable colored output               |

Speci warns if it detects an unknown `SPECI_*` environment variable that looks like a typo of a known one.

## Error Codes

Speci uses structured error codes for diagnostics. Use `--verbose` to see full error details including causes and suggested solutions.

### Prerequisite Errors (ERR-PRE-\*)

| Code       | Message                          | Solution                                      |
| ---------- | -------------------------------- | --------------------------------------------- |
| ERR-PRE-01 | Copilot CLI is not installed     | Run `npm install -g @github/copilot`          |
| ERR-PRE-02 | Copilot CLI is not authenticated | Run `/login` in Copilot CLI or set `GH_TOKEN` |
| ERR-PRE-03 | Not a git repository             | Run `git init` in your project root           |
| ERR-PRE-04 | Configuration file not found     | Run `npx speci init`                          |
| ERR-PRE-05 | PROGRESS.md file not found       | Run `npx speci task --plan <plan-file>`       |
| ERR-PRE-06 | No PROGRESS.md found during run  | Generate tasks first with `npx speci task`    |

### Input Errors (ERR-INP-\*)

| Code       | Message                          | Solution                                                       |
| ---------- | -------------------------------- | -------------------------------------------------------------- |
| ERR-INP-01 | Required argument missing        | Check command usage with `--help`                              |
| ERR-INP-02 | Agent file not found             | Verify the path, or set to `null` in config for bundled agents |
| ERR-INP-03 | Config file is malformed         | Fix JSON syntax in `speci.config.json`                         |
| ERR-INP-04 | Config validation failed         | Check config values against the reference above                |
| ERR-INP-05 | Plan file not found              | Provide a valid path with `--plan`                             |
| ERR-INP-06 | Config version is not compatible | Update to version 1.x or re-run `npx speci init`               |
| ERR-INP-07 | Path escapes project directory   | Use paths within the project root, avoid `../` traversal       |
| ERR-INP-08 | Invalid permissions value        | Use `allow-all`, `yolo`, `strict`, or `none`                   |
| ERR-INP-09 | Invalid maxFixAttempts value     | Must be a positive integer                                     |
| ERR-INP-10 | Invalid maxIterations value      | Must be a positive integer                                     |
| ERR-INP-11 | Subagent prompt not found        | Reinstall speci or provide a custom agent path                 |

### State Errors (ERR-STA-\*)

| Code       | Message                           | Solution                                        |
| ---------- | --------------------------------- | ----------------------------------------------- |
| ERR-STA-01 | Another speci instance is running | Wait for it to finish or use `--force`          |
| ERR-STA-02 | Cannot parse PROGRESS.md          | Verify the markdown table format in PROGRESS.md |
| ERR-STA-03 | Invalid state transition          | Check PROGRESS.md state markers                 |

### Execution Errors (ERR-EXE-\*)

| Code       | Message                             | Solution                                                  |
| ---------- | ----------------------------------- | --------------------------------------------------------- |
| ERR-EXE-01 | Gate command failed                 | Fix lint, typecheck, or test errors in your code          |
| ERR-EXE-02 | Copilot execution failed            | Check Copilot authentication and permissions              |
| ERR-EXE-03 | Max iterations reached              | Review progress and increase `--max-iterations` if needed |
| ERR-EXE-04 | Max fix attempts exceeded           | Review gate failures and fix issues manually              |
| ERR-EXE-05 | Failed to create directory          | Check file system permissions and disk space              |
| ERR-EXE-06 | Failed to write file                | Check file system permissions and disk space              |
| ERR-EXE-07 | Agent templates directory not found | Reinstall speci                                           |
| ERR-EXE-08 | Failed to copy agent files          | Check file system permissions and disk space              |

### Exit Codes

| Code | Meaning                        |
| ---- | ------------------------------ |
| 0    | Success                        |
| 1    | General error                  |
| 2    | Invalid command or arguments   |
| 130  | Interrupted by SIGINT (Ctrl+C) |
| 143  | Terminated by SIGTERM          |

## Troubleshooting

### "Copilot CLI not found"

The GitHub Copilot CLI must be installed and available in your PATH:

```bash
# Install via npm
npm install -g @github/copilot

# Or via WinGet (Windows)
winget install GitHub.Copilot

# Or via Homebrew (macOS/Linux)
brew install copilot-cli

# Verify installation
copilot --version
```

### "Another speci instance is running"

A lock file from a previous run may still exist:

```bash
# Check if speci is actually running
# On Linux/macOS:
ps aux | grep speci
# On Windows:
tasklist | findstr speci

# If the process is not running, force past the stale lock
npx speci run --force

# Or remove the lock file manually
rm .speci-lock
```

### "Config file not found"

Initialize speci in your project:

```bash
npx speci init
```

### "PROGRESS.md file not found"

Generate tasks from a plan first. The task command creates the PROGRESS.md file:

```bash
npx speci plan -p "Describe what you want to build"
npx speci task --plan docs/plan.md
```

### Gate commands failing

Speci runs gate commands defined in `speci.config.json`. Make sure your project has the corresponding scripts in `package.json`:

```json
{
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

You can customize which commands speci runs by editing the `gate.commands` array in `speci.config.json`.

### Verbose mode

Use `--verbose` (or `-v`) with any command for detailed output including stack traces, config loading details, state transitions, and timing information:

```bash
npx speci run --verbose

# Or set the environment variable
SPECI_DEBUG=1 npx speci run
```

## License

MIT

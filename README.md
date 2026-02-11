# speci

AI-powered implementation loop orchestrator for GitHub Copilot.

## Features

- **Automated Implementation Loops** - Orchestrates Copilot-driven development workflows
- **Gate Validation** - Runs lint, typecheck, and test commands before committing
- **Progress Tracking** - Maintains state in PROGRESS.md with task completion tracking
- **Beautiful CLI** - Ice Blue styling with unicode glyphs and ANSI colors

## Quick Start

```bash
# Initialize speci in your project
npx tsx bin/speci.ts init

# Start the implementation loop
npx tsx bin/speci.ts run
```

## Installation

### Prerequisites

- **Node.js** 22.x or later
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

### Running speci

speci is designed to run with `tsx` for development:

```bash
# Clone the repository
git clone <repository-url>
cd speci

# Install dependencies
npm install

# Build
npm run build

# Run speci
node dist/bin/speci.js --help
```

For production use, you can install globally (after publishing to npm):

```bash
npm install -g speci
```

## Commands

### `speci init` (alias: `i`)

Initialize speci in your current project by creating configuration files and directory structure.

**Usage:**

```bash
speci init [options]
```

**Options:**

- `-u, --update-agents` - Update agent files even if they already exist
- `-v, --verbose` - Show detailed output

**Creates:**

- `speci.config.json` - Configuration file
- `docs/tasks/` - Task definition directory
- `.speci-logs/` - Log file directory
- `.github/copilot/agents/` - Copilot agent definitions

**Examples:**

```bash
# Initialize with defaults
speci init

# Update agent files to latest version
speci init --update-agents

# Short alias version
speci i
```

### `speci plan` (alias: `p`)

Generate an implementation plan using Copilot with an initial prompt or input files.

**Usage:**

```bash
speci plan [options]
```

**Options:**

- `-p, --prompt <text>` - Initial prompt describing what to plan
- `-i, --input <files...>` - Input files for context (design docs, specs)
- `-a, --agent <filename>` - Use custom agent file from `.github/copilot/agents/`
- `-o, --output <path>` - Save plan to specific file
- `-v, --verbose` - Show detailed output

**Note:** At least `--prompt` or `--input` must be provided.

**Examples:**

```bash
# Plan with an initial prompt
speci plan -p "Build a REST API for user authentication"

# Plan using a design doc as context
speci plan -i docs/design.md

# Combine input files with a prompt
speci plan -i spec.md -p "Focus on the authentication module"

# Save plan to a specific file
speci plan -i design.md -o docs/plan.md

# Use custom agent from .github/copilot/agents/
speci p -a my-custom-plan.agent.md -p "My feature"
```

### `speci task` (alias: `t`)

Generate task definitions from an implementation plan.

**Usage:**

```bash
speci task --plan <path> [options]
```

**Options:**

- `-p, --plan <path>` - Path to plan file (required)
- `-a, --agent <filename>` - Use custom agent file from `.github/copilot/agents/`
- `-v, --verbose` - Show detailed output

**Examples:**

```bash
# Generate tasks from plan
speci task --plan docs/plan.md

# Short alias version
speci t -p docs/plan.md
```

### `speci refactor` (alias: `r`)

Analyze codebase for refactoring opportunities using Copilot.

**Usage:**

```bash
speci refactor [options]
```

**Options:**

- `-s, --scope <path>` - Directory or glob pattern to analyze
- `-o, --output <path>` - Save refactoring plan to file
- `-a, --agent <filename>` - Use custom agent file from `.github/copilot/agents/`
- `-v, --verbose` - Show detailed output

**Examples:**

```bash
# Analyze entire project
speci refactor

# Analyze specific directory
speci refactor --scope lib/

# Analyze TypeScript files only
speci r -s "lib/**/*.ts"
```

### `speci status` (alias: `s`)

Show current loop state and task statistics.

**Usage:**

```bash
speci status [options]
```

**Options:**

- `--json` - Output status as JSON
- `-v, --verbose` - Show detailed status information

**Examples:**

```bash
# Show current status
speci status

# Output as JSON for scripts
speci s --json

# Detailed status information
speci status --verbose
```

**Output Fields:**

- Current loop state (WORK_LEFT, IN_REVIEW, COMPLETE, etc.)
- Task completion statistics
- Current iteration number
- Lock status

### `speci run`

Execute the implementation loop. Acquires a lock file to prevent concurrent runs.

**Usage:**

```bash
speci run [options]
```

**Options:**

- `--max-iterations <n>` - Maximum loop iterations
- `--dry-run` - Show what would execute without running
- `--force` - Override existing lock file
- `-y, --yes` - Skip confirmation prompt
- `-v, --verbose` - Show detailed output

**Examples:**

```bash
# Start implementation loop
speci run

# Limit to 5 iterations
speci run --max-iterations 5

# Preview actions without executing
speci run --dry-run
```

**Note:** This command intentionally has no short alias for safety.

## Configuration

### speci.config.json

The configuration file is created by `speci init` and can be customized:

```json
{
  "version": "1.0.0",
  "paths": {
    "progress": "docs/PROGRESS.md",
    "tasks": "docs/tasks",
    "logs": ".speci-logs",
    "lock": ".speci.lock"
  },
  "copilot": {
    "permissions": "allow-all",
    "model": null,
    "extraFlags": []
  },
  "gate": {
    "commands": ["npm run lint", "npm run typecheck", "npm run test"],
    "maxFixAttempts": 3,
    "strategy": "sequential"
  },
  "loop": {
    "maxIterations": 100
  }
}
```

**Gate Configuration:**

- `gate.commands` - Array of shell commands to run as quality gates
- `gate.maxFixAttempts` - Maximum number of automatic fix attempts after gate failures
- `gate.strategy` - Execution strategy for gate commands:
  - `"sequential"` (default) - Run commands one after another
  - `"parallel"` - Run all commands concurrently (30-50% faster for independent commands)

**Note:** Parallel execution requires commands to be independent (no shared resources like lock files or ports).

### Environment Variables

Environment variables can override configuration file settings:

| Variable                 | Config Path           | Description                                   |
| ------------------------ | --------------------- | --------------------------------------------- |
| `SPECI_PROGRESS_PATH`    | `paths.progress`      | Path to PROGRESS.md file                      |
| `SPECI_TASKS_PATH`       | `paths.tasks`         | Path to tasks directory                       |
| `SPECI_LOG_PATH`         | `paths.logs`          | Path to log directory                         |
| `SPECI_LOCK_PATH`        | `paths.lock`          | Path to lock file                             |
| `SPECI_COPILOT_MODEL`    | `copilot.model`       | Copilot model to use                          |
| `SPECI_MAX_ITERATIONS`   | `loop.maxIterations`  | Maximum loop iterations                       |
| `SPECI_ENABLE_AUTO_FIX`  | `loop.enableAutoFix`  | Enable automatic gate fix attempts            |
| `SPECI_MAX_FIX_ATTEMPTS` | `gate.maxFixAttempts` | Maximum fix attempts                          |
| `SPECI_DEBUG`            | N/A                   | Enable debug logging (1 or true)              |
| `SPECI_NO_ANIMATION`     | N/A                   | Disable banner animation (any value disables) |
| `NO_COLOR`               | N/A                   | Disable colored output                        |

## Error Codes

speci uses structured error codes for clear diagnostics:

### Prerequisite Errors (ERR-PRE-\*)

| Code       | Message                          | Solution                                      |
| ---------- | -------------------------------- | --------------------------------------------- |
| ERR-PRE-01 | Copilot CLI is not installed     | Run: `npm install -g @github/copilot`         |
| ERR-PRE-02 | Copilot CLI is not authenticated | Run `/login` in Copilot CLI or set `GH_TOKEN` |
| ERR-PRE-03 | Not a git repository             | Run `git init` in your project root           |
| ERR-PRE-04 | Configuration file not found     | Run `speci init` to create configuration      |
| ERR-PRE-05 | PROGRESS.md file not found       | Run `speci init` or create manually           |

### Input Errors (ERR-INP-\*)

| Code       | Message                   | Solution                                                   |
| ---------- | ------------------------- | ---------------------------------------------------------- |
| ERR-INP-01 | Required argument missing | Check command usage with `--help`                          |
| ERR-INP-02 | Agent file not found      | Run `speci init` or add agent to `.github/copilot/agents/` |
| ERR-INP-03 | Config file is malformed  | Fix JSON syntax in speci.config.json                       |
| ERR-INP-04 | Config validation failed  | Check config against schema                                |
| ERR-INP-05 | Plan file not found       | Provide valid path with `--plan`                           |

### State Errors (ERR-STA-\*)

| Code       | Message                  | Solution                                 |
| ---------- | ------------------------ | ---------------------------------------- |
| ERR-STA-01 | Lock file already exists | Wait for other instance or use `--force` |
| ERR-STA-02 | Cannot parse PROGRESS.md | Verify PROGRESS.md format                |
| ERR-STA-03 | Invalid state transition | Check PROGRESS.md state markers          |

### Execution Errors (ERR-EXE-\*)

| Code       | Message                   | Solution                                     |
| ---------- | ------------------------- | -------------------------------------------- |
| ERR-EXE-01 | Gate command failed       | Fix lint/typecheck/test errors               |
| ERR-EXE-02 | Copilot execution failed  | Check Copilot authentication and permissions |
| ERR-EXE-03 | Max iterations reached    | Review progress and increase limit if needed |
| ERR-EXE-04 | Max fix attempts exceeded | Review gate failures and fix manually        |

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

The GitHub Copilot CLI must be installed:

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

### "Lock file exists"

Another speci instance may be running:

```bash
# Check if speci is running
ps aux | grep speci

# If stale, remove lock manually
rm .speci.lock

# Or force override
speci run --force
```

### "Config file not found"

Initialize speci in your project:

```bash
speci init
```

### "PROGRESS.md file not found"

Run the task command to generate the progress file from your plan:

```bash
speci task --plan docs/plan.md
```

### Gate Commands Failing

Ensure your project has the necessary scripts in `package.json`:

```json
{
  "scripts": {
    "lint": "eslint . --ext .ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

### Verbose Mode Not Working

Enable verbose output to see detailed logs:

```bash
# Use --verbose flag
speci run --verbose

# Or set environment variable
SPECI_DEBUG=1 speci run
```

## Verbose Mode

Use `--verbose` (or `-v`) with any command for detailed output:

```bash
# Show detailed execution logs
speci run --verbose

# See config loading details
speci status --verbose

# Debug init process
speci init --verbose
```

**Verbose mode shows:**

- Stack traces on errors
- Configuration loading details
- State transition logs
- Child process details
- Debug timing information

**Note:** Verbose mode respects `NO_COLOR` environment variable.

## Validation Module

Speci provides a centralized validation module in `lib/validation/` for type-safe input validation:

### PathValidator

Validates file system paths with builder pattern:

```typescript
import { PathValidator } from '@/validation/path-validator.js';

const result = new PathValidator(filePath)
  .exists()
  .isReadable()
  .isWithinProject(projectRoot)
  .validate();

if (!result.success) {
  console.error(result.error.message);
  result.error.suggestions?.forEach((s) => console.log(s));
}
```

### ConfigValidator

Validates configuration objects:

```typescript
import { ConfigValidator } from '@/validation/config-validator.js';

const result = new ConfigValidator(config)
  .validateVersion()
  .validatePaths()
  .validateCopilot()
  .validate();
```

### InputValidator

Validates command input (files, prompts):

```typescript
import { InputValidator } from '@/validation/input-validator.js';

const result = new InputValidator(fs)
  .requireInput(files, prompt)
  .validateFiles(files)
  .validate();
```

All validators return `ValidationResult<T>`, a discriminated union with consistent error messages and actionable suggestions.

## License

MIT

## Contributing

Contributions are welcome! Please ensure:

- Code passes all gates (`npm run lint`, `npm run typecheck`, `npm run test`)
- Tests are included for new features
- Documentation is updated
- Commit messages follow conventional commits format

## Support

For issues and questions:

- Check the [Troubleshooting](#troubleshooting) section
- Review [Error Codes](#error-codes) for diagnostics
- Enable verbose mode (`--verbose`) for detailed logs
- Open an issue on GitHub with reproduction steps

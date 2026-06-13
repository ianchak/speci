---
title: speci run
description: Start the autonomous Copilot implementation loop.
---

# `speci run`

Central orchestration loop. Reads `PROGRESS.md` state, dispatches agents, runs gate validations, and iterates until all tasks are done or limits are reached.

## Usage

```bash
speci run [--max-iterations 10] [--dry-run] [--force] [--yes] [--verify] [--verbose]
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--max-iterations <n>` | `10` | Maximum number of loop iterations |
| `--dry-run` | `false` | Print what would happen without executing anything |
| `--force` | `false` | Skip the pre-run confirmation prompt |
| `--yes` | `false` | Auto-confirm all prompts |
| `--verify` | `false` | Run quality gates before the first iteration |
| `--verbose` | `false` | Show full agent output |

## Loop states

| State | Agent dispatched | Description |
|-------|-----------------|-------------|
| `WORK_LEFT` | `impl` | Tasks remain; implementation agent runs next |
| `IN_REVIEW` | `review` | Completed tasks are queued for review |
| `BLOCKED` | `tidy` | All remaining tasks are blocked |
| `DONE` | — | All tasks complete; loop exits |
| `NO_PROGRESS` | — | No `PROGRESS.md` found; run `speci init` |

## Gate validation

After every `impl` agent run, speci executes the gates defined in `speci.config.json`:

```json
{
  "gates": {
    "lint": "npm run lint",
    "typecheck": "npm run typecheck",
    "test": "npm test"
  }
}
```

If any gate fails, the `fix` agent is dispatched (up to `maxFixAttempts` times). Gates are re-run after each fix attempt.

## High-level flow

```
Load config → Preflight → Acquire lock
  └─► MAIN LOOP (up to maxIterations)
        Read PROGRESS.md → Dispatch agent
        If WORK_LEFT: impl → gates → (fix loop on failure)
        If IN_REVIEW:  review
        If BLOCKED:    tidy
        If DONE:       exit 0
  └─► Cleanup (release lock, close logs)
```

## Example

```bash
# Run with at most 20 iterations, no prompts
speci run --max-iterations 20 --yes
```

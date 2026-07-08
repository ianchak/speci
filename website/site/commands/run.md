---
title: speci run
description: Start the autonomous Copilot implementation loop.
sitemap:
  priority: 0.8
  changefreq: monthly
---

# `speci run`

Central orchestration loop. Reads `PROGRESS.md` state, dispatches agents, runs gate validations, and iterates until all tasks are done or limits are reached.

## Usage

```bash
speci run [--max-iterations 100] [--dry-run] [--force] [-y] [--verify] [--sleep-after] [-v]
```

## Options

| Flag                   | Default | Description                                                     |
| ---------------------- | ------- | --------------------------------------------------------------- |
| `--max-iterations <n>` | `100`   | Maximum number of loop iterations                               |
| `--dry-run`            | `false` | Print what would happen without executing anything              |
| `--force`              | `false` | Override existing lock                                          |
| `-y, --yes`            | `false` | Skip confirmation prompt                                        |
| `--verify`             | `false` | Pause on manual validation tasks (MVTs) at milestone boundaries |
| `--sleep-after`        | `false` | Put machine to sleep after command completes                    |
| `-v, --verbose`        | `false` | Show full agent output                                          |

## Loop states

| State         | Agent dispatched | Description                                                  |
| ------------- | ---------------- | ------------------------------------------------------------ |
| `WORK_LEFT`   | `impl`           | Tasks remain; implementation agent runs next                 |
| `IN_REVIEW`   | `review`         | Tasks awaiting review; review agent evaluates implementation |
| `BLOCKED`     | `tidy`           | All remaining tasks are blocked                              |
| `DONE`        | —                | All tasks complete; loop exits                               |
| `NO_PROGRESS` | —                | No `PROGRESS.md` found; run `speci task`                     |

## Gate validation

After every `impl` agent run, speci executes the gates defined in `speci.config.json`:

```json
{
  "gate": {
    "commands": ["npm run lint", "npm run typecheck", "npm test"],
    "maxFixAttempts": 5,
    "strategy": "sequential"
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

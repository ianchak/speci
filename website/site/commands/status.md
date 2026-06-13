---
title: speci status
description: Print the current PROGRESS.md state.
---

# `speci status`

Reads `PROGRESS.md` and prints the current state of all tasks without running any agents.

## Usage

```bash
speci status [--verbose]
```

## Options

| Flag | Description |
|------|-------------|
| `--verbose` | Show full task details |

## Output

Prints a summary table of tasks with their current states (`TODO`, `IN_PROGRESS`, `IN_REVIEW`, `BLOCKED`, `DONE`) and the overall loop state (`WORK_LEFT`, `IN_REVIEW`, `BLOCKED`, `DONE`).

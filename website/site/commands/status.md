---
title: speci status
description: Print the current PROGRESS.md state.
sitemap:
  priority: 0.6
  changefreq: monthly
---

# `speci status`

Displays the current loop state and task statistics as a live fullscreen dashboard. Press `q` to quit the dashboard.

## Usage

```bash
speci status [--json] [--once] [-v]
```

## Options

| Flag            | Description                                 |
| --------------- | ------------------------------------------- |
| `--json`        | Output status as JSON and exit              |
| `--once`        | Show status once and exit (non-interactive) |
| `-v, --verbose` | Show detailed status                        |

## Output

By default opens a live fullscreen dashboard that refreshes automatically (press `q` to quit). Use `--once` for a single-shot summary or `--json` to emit machine-readable output.

Task states: `NOT STARTED`, `IN PROGRESS`, `IN REVIEW`, `BLOCKED`, `COMPLETE`

Loop states: `WORK_LEFT`, `IN_REVIEW`, `BLOCKED`, `DONE`, `NO_PROGRESS`

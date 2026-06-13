---
title: speci clean
description: Remove generated task files, PROGRESS.md, and lock files.
---

# `speci clean`

Removes generated files created by `speci task` and `speci run` so you can start fresh.

## Usage

```bash
speci clean [--all] [--verbose]
```

## Options

| Flag | Description |
|------|-------------|
| `--all` | Also remove the agent template files in `.github/agents/` |
| `--verbose` | Show which files are being removed |

## What it removes

| File | Description |
|------|-------------|
| `PROGRESS.md` | Task tracking file |
| `.speci-lock` | Loop lock file |
| `.speci-logs/` | Log directory |
| `*.task.md` | Individual task files (project root) |

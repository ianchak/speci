---
title: speci yolo
description: Full pipeline — plan → task → run — in a single command.
---

# `speci yolo`

Full pipeline orchestrator: **plan → task → run** in a single command. Chains all three commands sequentially with shared config and lock management.

## Usage

```bash
speci yolo --prompt "Build a REST API" --input docs/spec.md [--output docs/plan.md] [--force] [--verbose]
```

## Options

| Flag | Description |
|------|-------------|
| `-p, --prompt <text>` | Free-text prompt (passed to `speci plan`) |
| `-i, --input <files...>` | Input files (passed to `speci plan`) |
| `-o, --output <path>` | Plan output path (default: `docs/plan.md`) |
| `--force` | Skip confirmation prompts |
| `--verbose` | Show full agent output |

At least one of `--prompt` or `--input` is required.

## Pipeline

```
Phase 1/3: plan   — generate structured plan document
Phase 2/3: task   — generate tasks and PROGRESS.md
Phase 3/3: run    — autonomous implementation loop
```

Each phase must succeed before the next starts. A failure in any phase aborts the pipeline with a phase-aware error message.

## Example

```bash
speci yolo -p "Add OAuth2 login with GitHub" --force
```

This is equivalent to running:

```bash
speci plan -p "Add OAuth2 login with GitHub" --output docs/plan.md
speci task --plan docs/plan.md
speci run --force
```

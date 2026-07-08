---
title: speci yolo
description: Full pipeline — plan → task → run — in a single command.
sitemap:
  priority: 0.7
  changefreq: monthly
---

# `speci yolo`

Full pipeline orchestrator: **plan → task → run** in a single command. Chains all three commands sequentially with shared config and lock management.

## Usage

```bash
speci yolo [-p "..."] [-i <files...>] [-o <path>] [--force] [--sleep-after] [-v]
```

## Options

| Flag                     | Description                                                               |
| ------------------------ | ------------------------------------------------------------------------- |
| `-p, --prompt <text>`    | Free-text prompt (passed to `speci plan`)                                 |
| `-i, --input <files...>` | Input files (passed to `speci plan`)                                      |
| `-o, --output <path>`    | Plan output path (default: auto-generated timestamped path under `docs/`) |
| `--force`                | Override existing lock                                                    |
| `--sleep-after`          | Put machine to sleep after command completes                              |
| `-v, --verbose`          | Show full agent output                                                    |

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
speci plan -p "Add OAuth2 login with GitHub" --output <timestamped-path>
speci task -p <timestamped-path>
speci run --yes --force
```

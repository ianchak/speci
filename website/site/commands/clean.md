---
title: speci clean
description: Remove generated task files, PROGRESS.md, and lock files.
---

# `speci clean`

Removes generated files created by `speci task` and `speci run` so you can start fresh.

## Usage

```bash
speci clean [-y] [-v]
```

## Options

| Flag            | Description                        |
| --------------- | ---------------------------------- |
| `-y, --yes`     | Skip confirmation prompt           |
| `-v, --verbose` | Show which files are being removed |

## What it removes

| Path                     | Description              |
| ------------------------ | ------------------------ |
| `docs/tasks/` (contents) | All generated task files |
| `docs/PROGRESS.md`       | Task tracking file       |

> **Note:** `speci clean` refuses to run while another speci process holds the lock. Wait for the active run to finish first.

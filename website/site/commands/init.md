---
title: speci init
description: Initialise speci in your project.
---

# `speci init`

Initialise speci in an existing project. Creates `speci.config.json` and copies the built-in agent templates into `.github/agents/`.

## Usage

```bash
speci init [--force]
```

## Options

| Flag | Description |
|------|-------------|
| `--force` | Overwrite existing config and agent files |

## What it creates

| File | Description |
|------|-------------|
| `speci.config.json` | Project configuration (gates, agent paths, etc.) |
| `.github/agents/speci-plan.agent.md` | Plan generation agent |
| `.github/agents/speci-impl.agent.md` | Implementation agent |
| `.github/agents/speci-review.agent.md` | Review agent |
| `.github/agents/speci-fix.agent.md` | Gate failure fix agent |
| `.github/agents/speci-task.agent.md` | Task generation agent |
| `.github/agents/speci-tidy.agent.md` | Blocked-state tidy agent |
| `.github/agents/speci-refactor.agent.md` | Refactor analysis agent |
